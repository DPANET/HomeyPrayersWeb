import { NextFunction, Request, Response } from 'express';
import * as exceptionHandler from '../exceptions/exception.handler.js';
export declare class ExceptionMiddleware {
    constructor();
    errorMiddleware(error: exceptionHandler.HttpException, request: Request, response: Response, next: NextFunction): void;
}
