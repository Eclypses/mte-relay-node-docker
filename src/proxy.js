/**
 * Configure the proxy and all it's settings here. Then export it and use it.
 */
const httpProxy = require("http-proxy");
const {
  HOST,
  MTE_ENCODED_CONTENT_TYPE_HEADER_NAME,
  COOKIE_NAME,
} = require("./settings");
const { mteEncode } = require("mte-helpers");
const fs = require("fs");

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  hostRewrite: true,
  followRedirects: false,
  target: HOST,
  selfHandleResponse: true,
});

// handle outbound proxy RESPONSES
// server app -> proxy (you are here) -> client device
proxy.on("proxyRes", async (proxyRes, req, res) => {
  try {
    if (req.method === "HEAD") {
      return res.end();
    }

    if (req.files?.length > 0) {
      req.files.forEach((file) => {
        fs.promises.rm(file.path).catch((err) => {
          console.log("Error when trying to delete file: " + file.path);
        });
      });
    }

    // else, save up encoded data as it comes in,
    // when it's all in, decode it!
    let _buffer = new Uint8Array();
    proxyRes.on("data", (chunk) => {
      _buffer = concatTwoUint8Arrays(_buffer, chunk);
    });
    proxyRes.on("end", async (chunk) => {
      try {
        if (chunk) {
          _buffer = concatTwoUint8Arrays(_buffer, chunk);
        }

        // if proxy status is not 2xx, return the proxy response
        if (proxyRes.statusCode < 200 || proxyRes.statusCode > 299) {
          res.statusCode = proxyRes.statusCode;
          res.statusMessage = proxyRes.statusMessage;
          return res.end();
        }

        // if no chunk, send response
        if (!_buffer) {
          return res.end();
        }

        const clientMteId = req.signedCookies[COOKIE_NAME];
        const responseContentType = proxyRes.headers["content-type"];

        const encodedContentTypeHeader = await mteEncode(responseContentType, {
          id: `encoder_${clientMteId}`,
          output: "B64",
        });
        const encodedBody = await mteEncode(_buffer, {
          id: `encoder_${clientMteId}`,
          output: "Uint8Array",
        });

        res.writeHead(200, {
          "Content-Type": encodedBody.byteLength,
          "Content-Type": "application/octet-stream",
          [MTE_ENCODED_CONTENT_TYPE_HEADER_NAME]: encodedContentTypeHeader,
        });
        res.end(encodedBody, "binary");
      } catch (err) {
        console.log(err);
        res.writeHead(559);
        res.end(err.message);
      }
    });
  } catch (err) {
    console.log(err);
    res.writeHead(500);
    res.end(err.message);
  }
});

// utils function to concat two uint8arrays
function concatTwoUint8Arrays(arr1, arr2) {
  const newBuffer = new Uint8Array(arr1.length + arr2.length);
  newBuffer.set(arr1);
  newBuffer.set(arr2, arr1.length);
  return newBuffer;
}

module.exports = {
  proxy,
};
