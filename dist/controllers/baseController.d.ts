import { Request, Response, NextFunction } from 'express';
/**
 * Controller interface for all controllers
 */
export interface IController {
    [key: string]: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>;
}
/**
 * Base controller with common utility methods
 */
export declare abstract class BaseController {
    protected ok(res: Response, data?: any): Response<any, Record<string, any>>;
    protected created(res: Response, data?: any): Response<any, Record<string, any>>;
    protected clientError(res: Response, message?: string): Response<any, Record<string, any>>;
    protected unauthorized(res: Response, message?: string): Response<any, Record<string, any>>;
    protected forbidden(res: Response, message?: string): Response<any, Record<string, any>>;
    protected notFound(res: Response, message?: string): Response<any, Record<string, any>>;
    protected fail(res: Response, error: Error | string): Response<any, Record<string, any>>;
}
