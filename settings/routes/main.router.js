import express from "express";
import config from "nconf";
import path from "path";
import * as exceptionMiddleware from "../middlewares/exceptions.middleware.js";
//import helmet from "helmet";
//import proxy from "http-proxy-middleware";
export class App {
    constructor(controllers) {
        this.app = express();
        this._mainFolder = config.get('WEBROOT');
        this._stataicFolder = config.get('STATIC_FILES');
        this._port = config.get("PORT");
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
        let folderPath = path.join(this._mainFolder, this._stataicFolder);
        this.app.use(config.get('MAIN_FILE_URL'), express.static(folderPath));
        this.app.use(express.static("build/web_modules"));
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
//# sourceMappingURL=main.router.js.map