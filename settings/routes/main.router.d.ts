/// <reference types="node" />
import express from "express";
import { IController } from "../controllers/controllers.interface.js";
export declare class App {
    app: express.Application;
    private _port;
    private _excpetionMiddleware;
    private _mainFolder;
    private _stataicFolder;
    constructor(controllers: IController[]);
    listen(): import("http").Server;
    private initializeMiddlewares;
    private initializeAuthenticators;
    private initializeControllers;
    private initializeErrorMiddleware;
    private initializeDatabase;
}
