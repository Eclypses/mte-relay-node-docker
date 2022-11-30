# Node Docker Translator

The NodeJS Docker Translator is a proxy server that takes MTE encoded requests, decodes them and proxies them onward to their host application. It then catches responses, MTE encodes the responses, and proxies them back to the client applications.

## Start Up

The only requirement is that [NodeJS](https://nodejs.org/en/download/) is installed on your machine.

From the root directory

1. Run the command `npm i` to install dependencies.
2. Run `npm run dev` to run the project in dev mode.
