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
export abstract class BaseController {
  protected ok(res: Response, data?: any) {
    if (data) {
      return res.status(200).json(data);
    }
    return res.sendStatus(200);
  }

  protected created(res: Response, data?: any) {
    if (data) {
      return res.status(201).json(data);
    }
    return res.sendStatus(201);
  }

  protected clientError(res: Response, message: string = 'Bad request') {
    return res.status(400).json({ message });
  }

  protected unauthorized(res: Response, message: string = 'Unauthorized') {
    return res.status(401).json({ message });
  }

  protected forbidden(res: Response, message: string = 'Forbidden') {
    return res.status(403).json({ message });
  }

  protected notFound(res: Response, message: string = 'Not found') {
    return res.status(404).json({ message });
  }

  protected fail(res: Response, error: Error | string) {
    console.error(error);
    return res.status(500).json({
      message: typeof error === 'string' ? error : error.message
    });
  }
}
