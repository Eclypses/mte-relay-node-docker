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
  followRedirects: false,
  target: HOST,
  selfHandleResponse: true,
});

// handle outbound proxy RESPONSES
// server app -> proxy (you are here) -> client device
proxy.on("proxyRes", async (proxyRes, req, res) => {
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

  const clientMteId = req.signedCookies[COOKIE_NAME];
  const responseContentType = proxyRes.headers["content-type"];

  // else, save up encoded data as it comes in,
  // when it's all in, decode it! then go next
  let _buffer = new Uint8Array();
  proxyRes.on("data", (chunk) => {
    _buffer = concatTwoUint8Arrays(_buffer, chunk);
  });
  proxyRes.on("end", async (chunk) => {
    if (chunk) {
      _buffer = concatTwoUint8Arrays(_buffer, chunk);
    }
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
  });
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
