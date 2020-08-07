export class ExceptionMiddleware {
    constructor() {
    }
    errorMiddleware(error, request, response, next) {
        const status = error.status || 500;
        const message = error.message || 'Something went wrong';
        response
            .status(status)
            .send({
            status,
            message,
        });
    }
}
//# sourceMappingURL=exceptions.middleware.js.map