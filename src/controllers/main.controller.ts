import Debug from 'debug';
const debug= Debug("app:router");
import {IController} from "./controllers.interface.js";
import express from 'express';
import path from 'path';
import config from "nconf";
import { fileURLToPath } from 'url';

//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);
//const __dirname = path.dirname(fileURLToPath(import.meta.url));
export default class MainController implements IController

{

    
    path: string;
    router: express.Router;
    private _filePath:string;
    private _fileName:string;
    private _rootPath:string;
    constructor()
    {
        this.path = config.get("MAIN_FILE_URL");
        this.router= express.Router();
        this._filePath = config.get("MAIN_FILE_PATH");
        this._fileName = config.get("MAIN_FILE_NAME");
        this._rootPath = config.get("WEBROOT");
         this._filePath = path.join(__dirname,this._filePath,this._fileName);
        this.initializeRoutes();
        
    }
    private initializeRoutes() {
        this.router.get(this.path, this.mainPageRoute);
      }
    private mainPageRoute=  (request: express.Request, response: express.Response)=>
    {
        
        response.sendFile(this._filePath,{index:false,dotfiles:"allow",redirect:true});
    }

}