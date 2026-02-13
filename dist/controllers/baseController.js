/**
 * Base controller with common utility methods
 */
export class BaseController {
    ok(res, data) {
        if (data) {
            return res.status(200).json(data);
        }
        return res.sendStatus(200);
    }
    created(res, data) {
        if (data) {
            return res.status(201).json(data);
        }
        return res.sendStatus(201);
    }
    clientError(res, message = 'Bad request') {
        return res.status(400).json({ message });
    }
    unauthorized(res, message = 'Unauthorized') {
        return res.status(401).json({ message });
    }
    forbidden(res, message = 'Forbidden') {
        return res.status(403).json({ message });
    }
    notFound(res, message = 'Not found') {
        return res.status(404).json({ message });
    }
    fail(res, error) {
        console.error(error);
        return res.status(500).json({
            message: typeof error === 'string' ? error : error.message
        });
    }
}
//# sourceMappingURL=baseController.js.map