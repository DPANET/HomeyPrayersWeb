"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const nconf_1 = __importDefault(require("nconf"));
//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);
//const __dirname = path.dirname(fileURLToPath(import.meta.url));
class MainController {
    constructor() {
        this.mainPageRoute = (request, response) => {
            response.sendFile(this._filePath, { index: false, dotfiles: "allow", redirect: true });
        };
        this.path = nconf_1.default.get("MAIN_FILE_URL");
        this.router = express_1.default.Router();
        this._filePath = nconf_1.default.get("MAIN_FILE_PATH");
        this._fileName = nconf_1.default.get("MAIN_FILE_NAME");
        this._rootPath = nconf_1.default.get("WEBROOT");
        this._filePath = path_1.default.join(__dirname, this._filePath, this._fileName);
        this.initializeRoutes();
    }
    initializeRoutes() {
        this.router.get(this.path, this.mainPageRoute);
    }
}
exports.default = MainController;
//# sourceMappingURL=main.controller.js.map