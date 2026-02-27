const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "jose") {
        return {
            filePath: path.resolve(
                __dirname,
                "node_modules/jose/dist/browser/index.js"
            ),
            type: "sourceFile",
        };
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
