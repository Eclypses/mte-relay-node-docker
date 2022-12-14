const express = require("express");
const cors = require("cors");
const Readable = require("stream").Readable;
const fs = require("fs");
const FormData = require("form-data");
const multer = require("multer");
const upload = multer({ dest: "uploads/", preservePath: true });
const cookieParser = require("cookie-parser");
const serverError = require("./custom-error");
const { logger, mteLogger } = require("./logger");

const { proxy } = require("./proxy");
const { makeNonce } = require("./utils/nonce");
const { getEcdh } = require("./utils/ecdh");
const {
  instantiateMteWasm,
  createMteEncoder,
  createMteDecoder,
  mteDecode,
} = require("mte-helpers");
const {
  PORT,
  MTE_ID,
  MTE_ID_HEADER,
  MTE_ENCODED_CONTENT_TYPE_HEADER_NAME,
  COOKIE_SECRET,
  COOKIE_NAME,
  LICENSE_COMPANY,
  LICENSE_key,
  CORS_ORIGINS,
  CORS_METHODS,
  ACCESS_TOKEN,
  REDIS_URL,
} = require("./settings");
const { makeId } = require("./utils/make-id");
const { writeMteReport } = require("./report-unique-clients");
const { startupChecks } = require("./startup");
const { createClient } = require("redis");

// run start up checks
startupChecks();
logger.debug("Start up checks passed");

// if Redis is available, connect to it
const hasRedisUrl = Boolean(REDIS_URL);
let redisClient = null;
if (hasRedisUrl) {
  redisClient = createClient({
    url: REDIS_URL,
  });
  redisClient
    .connect()
    .then(() => {
      logger.info("Connected to Redis.");
    })
    .catch((err) => {
      logger.error("Failed to connect to Redis.", err.message);
      throw Error(err.message);
    });
}

// initialize MTE Wasm
instantiateMteWasm({
  licenseCompany: LICENSE_COMPANY,
  licenseKey: LICENSE_key,
  sequenceWindow: -63,
  encoderType: "MKE",
  decoderType: "MKE",
  saveStateAs: "B64",
  keepAlive: 3000,
  saveState: hasRedisUrl
    ? async function customSaveState(id, value) {
        return redisClient.set(id, value);
      }
    : undefined,
  takeState: hasRedisUrl
    ? async function customTakeState(id) {
        const value = await redisClient.get(id);
        await redisClient.del(id);
        return value;
      }
    : undefined,
}).catch((err) => {
  logger.error("Failed to instantiate MTE Wasm.", err);
  process.exit(1);
});
logger.info("MTE Wasm initialized.");

// create server instance
const server = express();

// disabled `x-powered-by: express` http header for all request/responses
server.disable("x-powered-by");

// allow CORs requests
server.use(
  cors({
    origin: CORS_ORIGINS,
    methods: CORS_METHODS,
    credentials: true,
    exposedHeaders: [MTE_ID_HEADER, MTE_ENCODED_CONTENT_TYPE_HEADER_NAME],
  })
);

// log incoming requests
server.use((req, res, next) => {
  logger.debug(`${req.method} ${req.url}`);
  next();
});

/**
 * Parse incoming request for cookies signed with this secret
 */
server.use(cookieParser(COOKIE_SECRET));

/**
 * Middleware to set "x-mte-id" header and "mte-id" cookie
 */
server.use((req, res, next) => {
  res.setHeader(MTE_ID_HEADER, MTE_ID);

  const date = new Date();
  date.setDate(date.getDate() + 31 /*days*/);
  const idCookieValue = req.signedCookies[COOKIE_NAME] || makeId();
  res.cookie(COOKIE_NAME, idCookieValue, {
    expires: date,
    httpOnly: true,
    signed: true,
    sameSite: "none", // allow all, secure must be true
    secure: true,
  });

  logger.debug("Request's Client ID: " + idCookieValue);
  mteLogger.info(`${idCookieValue},${req.method},${req.url},${Date.now()}`);

  next();
});

// Unique devices report
server.get("/api/mte-report/:authToken", async (req, res, next) => {
  try {
    // compare with known value
    if (req.params.authToken !== ACCESS_TOKEN) {
      throw new serverError("Unauthorized", 401);
    }

    // get month as number
    let month = new Date().getMonth() + 1;
    if (req.query.month) {
      month = parseInt(req.query.month, 10);
    }

    const { fileName, filePath } = await writeMteReport(month);

    res.download(filePath, fileName, (err) => {
      if (err) {
        logger.error(err);
        return next(err);
      }

      logger.info("MTE Report downloaded: " + fileName);
      fs.unlink(filePath, (err) => {
        if (err) {
          logger.error(`Failed to delete report`, err);
        }
      });
    });
  } catch (error) {
    logger.error(error.message, error);
    next(error);
  }
});

// returns headers only
server.head("/api/mte-relay", (_req, res, _next) => {
  res.status(200).send();
});

// MTE Pair Route
server.post("/api/mte-pair", express.json(), async (req, res, next) => {
  try {
    logger.debug("Body:\n" + JSON.stringify(req.body, null, 2));
    const clientId = req.signedCookies[COOKIE_NAME];
    if (!clientId) {
      return res.status(401).send("Unauthorized.");
    }

    // create init values
    const encoderNonce = makeNonce();
    const encoderEcdh = await getEcdh();
    const encoderEntropy = encoderEcdh.computeSharedSecret(
      req.body.decoderPublicKey
    );
    logger.debug("Server Encoder Entropy: " + encoderEntropy.toString());

    const decoderNonce = makeNonce();
    const decoderEcdh = await getEcdh();
    const decoderEntropy = decoderEcdh.computeSharedSecret(
      req.body.encoderPublicKey
    );
    logger.debug("Server Decoder Entropy: " + decoderEntropy.toString());

    // create initial encoder/decoder states
    createMteEncoder({
      id: `encoder_${clientId}`,
      entropy: encoderEntropy,
      nonce: encoderNonce,
      personalization: req.body.decoderPersonalizationStr,
    });
    createMteDecoder({
      id: `decoder_${clientId}`,
      entropy: decoderEntropy,
      nonce: decoderNonce,
      personalization: req.body.encoderPersonalizationStr,
    });

    // send response
    res.json({
      encoderNonce,
      encoderPublicKey: encoderEcdh.publicKey,
      decoderNonce,
      decoderPublicKey: decoderEcdh.publicKey,
    });
  } catch (err) {
    const _error = new serverError(
      "An error occurred while generating MTE Pairing values.",
      500
    );
    next(_error);
  }
});

// handle all requests with proxy
server.use(
  "/",
  requireSignedCookieId,
  upload.any(),
  decodeMtePayloadMiddleware,
  async (req, res, _next) => {
    try {
      if (req.formData) {
        return proxy.web(req, res, {
          buffer: req.formData,
          headers: {
            ...req.formData.getHeaders(),
            "Content-Length": req.contentLength || undefined,
          },
        });
      }

      if (req.mteDecoded) {
        const stream = new Readable();
        stream.push(req.mteDecoded);
        stream.push(null);
        return proxy.web(req, res, {
          buffer: stream,
          headers: {
            "Content-Type": req.decodedContentTypeHeader || undefined,
            "Content-Length": req.mteDecoded?.length || undefined,
          },
        });
      }

      return proxy.web(req, res);
    } catch (err) {
      const _error = new serverError(
        "An error occurred while proxying the request.",
        500
      );
      next(_error);
    }
  }
);

// error handler
server.use("/", (err, req, res, next) => {
  if (err) {
    logger.warn(err.message, err);
    const status = err.status || 500;
    const msg = err.message || "An unknown error occurred.";
    return res.status(status).send(msg);
  }
  next();
});

// catch-all route, return 404
server.use((req, res) => {
  res.status(404).send("Not Found");
});

server.listen(PORT, () => {
  logger.info(`MTE Proxy Translator listening on at localhost:${PORT}`);
});

/**
 * A middleware that decodes the request.body, if it exists and is encoded
 */
async function decodeMtePayloadMiddleware(req, res, next) {
  try {
    const clientMteId = req.signedCookies[COOKIE_NAME];
    if (!clientMteId) {
      return res.status(401).send("Missing MTE ID header.");
    }

    // if no body to decode, then go next
    const bodyLength = req.headers["content-length"];
    if (!bodyLength) {
      return next();
    }

    /**
     * Handle multipart/form-data here
     */
    const contentTypeHeader = req.headers["content-type"];
    if (contentTypeHeader) {
      if (contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
        /**
         * Decode each key/value pair from req.body,
         * Add each decoded key/value pair to a new object for decoded values
         */
        let decodedBody = {};
        const entries = Object.entries(req.body);
        let i = 0;
        const iMax = entries.length;
        for (; i < iMax; ++i) {
          const [key, value] = entries[i];
          const decodedKey = await mteDecode(key, {
            id: `decoder_${clientMteId}`,
            output: "str",
          });
          const decodedValue = await mteDecode(value, {
            id: `decoder_${clientMteId}`,
            output: "str",
          });
          decodedBody[decodedKey] = decodedValue;
        }
        // re-declare req.body to be our new object of decoded
        req.body = decodedBody;

        /**
         * If encoded files were uploaded, an array of objects representing them will be available on req.files
         * Loop over each file object, decode it's field, fileName, and the file itself (writing decoded file to disk, deleting encoded version)
         * Modify key/values pairs of the fileObject to reflect the new decoded values
         */
        let j = 0;
        const jMax = req.files.length;
        for (; j < jMax; ++j) {
          const fileObject = req.files[j];
          fileObject.fieldname = await mteDecode(fileObject.fieldname, {
            id: `decoder_${clientMteId}`,
            output: "str",
          });
          fileObject.originalname = await mteDecode(fileObject.originalname, {
            id: `decoder_${clientMteId}`,
            output: "str",
          });
          const encodedData = await fs.promises.readFile(fileObject.path);
          const encodedU8 = new Uint8Array(encodedData.buffer);
          const decoded = await mteDecode(encodedU8, {
            id: `decoder_${clientMteId}`,
            output: "Uint8Array",
          });
          const newPath = `uploads/${fileObject.originalname}`;
          await fs.promises.writeFile(newPath, decoded);
          await fs.promises.rm(fileObject.path);
          fileObject.path = newPath;
        }

        /**
         * Create new FormData stream with decoded-values
         */
        var form = new FormData();
        Object.entries(req.body)?.forEach(([key, value]) => {
          form.append(key, value);
        });
        req.files?.forEach((fileObject) => {
          form.append(
            fileObject.fieldname,
            fs.createReadStream(fileObject.path)
          );
        });

        // asynchronously calculate the new request.body length
        const contentLength = await (() =>
          new Promise((resolve, reject) => {
            form.getLength((err, length) => {
              if (err) {
                return reject(err);
              }
              resolve(length);
            });
          }))();

        // attach formData to request object
        req.contentLength = contentLength;
        req.formData = form;

        // end this middleware
        return next();
      }
    }

    // decoded Content-Type header, if it exists
    const encodedContentTypeHeader =
      req.headers[MTE_ENCODED_CONTENT_TYPE_HEADER_NAME];
    if (encodedContentTypeHeader) {
      const decodedContentTypeHeader = await mteDecode(
        encodedContentTypeHeader,
        {
          id: `decoder_${clientMteId}`,
          output: "str",
        }
      );
      logger.debug(`Decoded Content-Type Header: ${decodedContentTypeHeader}`);
      req.decodedContentTypeHeader = decodedContentTypeHeader;
    }

    // decode req.body from raw streaming Uint8Array
    const encodedReqBody = await (() =>
      new Promise((resolve, reject) => {
        try {
          // else, save up encoded data as it comes in,
          // when it's all in, decode it! then go next
          let _buffer = new Uint8Array();
          req.on("data", (chunk) => {
            _buffer = concatTwoUint8Arrays(_buffer, chunk);
          });
          req.on("end", (chunk) => {
            if (chunk) {
              _buffer = concatTwoUint8Arrays(_buffer, chunk);
            }
            resolve(_buffer);
          });
        } catch (error) {
          reject(error);
        }
      }))();

    // MTE decode body
    const decoded = await mteDecode(encodedReqBody, {
      id: `decoder_${clientMteId}`,
      output: contentTypeIsText(req.decodedContentTypeHeader)
        ? "str"
        : "Uint8Array",
    });
    logger.debug("Decoded Body: " + decoded);
    // attach decoded body to req object
    req.mteDecoded = decoded;
    next();
  } catch (err) {
    const _err = new serverError("Failed to decode payload.", 559);
    next(_err);
  }
}

/**
 * Concatenate two uint8arrays
 */
function concatTwoUint8Arrays(arr1, arr2) {
  const newBuffer = new Uint8Array(arr1.length + arr2.length);
  newBuffer.set(arr1);
  newBuffer.set(arr2, arr1.length);
  return newBuffer;
}

// determine if encoded content should be decoded to text or to UInt8Array
function contentTypeIsText(contentType) {
  const textsTypes = ["text", "json", "xml", "javascript", "urlencoded"];
  return textsTypes.some((i) => contentType.toLowerCase().includes(i));
}

// A middleware that rejects any request that does not include a signed cookie with a value
function requireSignedCookieId(req, res, next) {
  const cookie = req.signedCookies[COOKIE_NAME];
  if (!cookie) {
    return res.status(401).send("Unauthorized");
  }
  next();
}
