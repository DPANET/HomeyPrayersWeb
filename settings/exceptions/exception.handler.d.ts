export declare class HttpException extends Error {
    status: number;
    message: string;
    constructor(status: number, message: string);
}
export declare class UserWithThatEmailAlreadyExistsException extends HttpException {
    constructor(email: string);
}
export declare class WrongCredentialsException extends HttpException {
    constructor();
}
export declare class PostNotFoundException extends HttpException {
    constructor(id: string);
}
export declare class AuthenticationTokenMissingException extends HttpException {
    constructor();
}
export declare class WrongAuthenticationTokenException extends HttpException {
    constructor();
}
