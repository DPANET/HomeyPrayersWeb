"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = void 0;
const express_1 = __importDefault(require("express"));
const nconf_1 = __importDefault(require("nconf"));
const path_1 = __importDefault(require("path"));
const exceptionMiddleware = __importStar(require("../middlewares/exceptions.middleware.js"));
//import helmet from "helmet";
//import proxy from "http-proxy-middleware";
class App {
    constructor(controllers) {
        this.app = express_1.default();
        this._mainFolder = nconf_1.default.get('WEBROOT');
        this._stataicFolder = nconf_1.default.get('STATIC_FILES');
        this._port = nconf_1.default.get("PORT");
        this.initializeDatabase();
        this.initializeMiddlewares();
        this.initializeAuthenticators();
        this.initializeControllers(controllers);
        this.initializeErrorMiddleware();
    }
    listen() {
        return this.app.listen(this._port, () => {
            console.log(`App listening on the port ${this._port}`);
        });
    }
    initializeMiddlewares() {
        // this.app.use('/Places/',
        // proxy({target:`https://maps.googleapis.com/maps/api/js?key=${config.get("GOOGLE_PLACE_KEY")}&libraries=places`,
        // changeOrigin:true,
        // ignorePath:true,
        // followRedirects:true}));
        //  this.app.use(helmet());
        let options = {
            dotfiles: 'ignore',
            etag: false,
            extensions: ['js', 'json'],
            index: false,
            maxAge: '1d',
            redirect: false,
            setHeaders: function (res, path, stat) {
                res.set('x-timestamp', Date.now());
            }
        };
        let folderPath = path_1.default.join(this._mainFolder, this._stataicFolder);
        this.app.use(nconf_1.default.get('MAIN_FILE_URL'), express_1.default.static(folderPath));
        // this.app.use(express.static("build/web_modules"));
        //this.app.use()
    }
    initializeAuthenticators() {
    }
    initializeControllers(controllers) {
        controllers.forEach((controller) => {
            this.app.use('/', controller.router);
        });
    }
    initializeErrorMiddleware() {
        this._excpetionMiddleware = new exceptionMiddleware.ExceptionMiddleware();
        this.app.use(this._excpetionMiddleware.errorMiddleware);
    }
    async initializeDatabase() {
    }
}
exports.App = App;
//# sourceMappingURL=main.router.js.map