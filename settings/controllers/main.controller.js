import Debug from 'debug';
const debug = Debug("app:router");
import express from 'express';
import path from 'path';
import config from "nconf";
//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);
//const __dirname = path.dirname(fileURLToPath(import.meta.url));
export default class MainController {
    constructor() {
        this.mainPageRoute = (request, response) => {
            response.sendFile(this._filePath, { index: false, dotfiles: "allow", redirect: true });
        };
        this.path = config.get("MAIN_FILE_URL");
        this.router = express.Router();
        this._filePath = config.get("MAIN_FILE_PATH");
        this._fileName = config.get("MAIN_FILE_NAME");
        this._rootPath = config.get("WEBROOT");
        this._filePath = path.join(__dirname, this._filePath, this._fileName);
        this.initializeRoutes();
    }
    initializeRoutes() {
        this.router.get(this.path, this.mainPageRoute);
    }
}
//# sourceMappingURL=main.controller.js.map