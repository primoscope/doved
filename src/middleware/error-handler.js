// Enhanced Error Handling Middleware for EchoTune AI

class ErrorHandler {
    static handle(err, req, res, _next) {
        console.error('Error occurred:', {
            error: err.message,
            stack: err.stack,
            url: req.url,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });

        // Default error status
        let statusCode = err.statusCode || 500;
        let message = err.message || 'Internal Server Error';

        // Handle specific error types
        if (err.name === 'ValidationError') {
            statusCode = 400;
            message = 'Validation Error';
        } else if (err.name === 'UnauthorizedError') {
            statusCode = 401;
            message = 'Unauthorized';
        } else if (err.name === 'CastError') {
            statusCode = 400;
            message = 'Invalid ID format';
        } else if (err.code === 11000) {
            statusCode = 409;
            message = 'Duplicate field value';
        }

        // In production, don't expose internal errors
        if (process.env.NODE_ENV === 'production' && statusCode === 500) {
            message = 'Something went wrong';
        }

        res.status(statusCode).json({
            success: false,
            error: {
                message,
                ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
            },
            timestamp: new Date().toISOString()
        });
    }

    static notFound(req, res, next) {
        const error = new Error(`Route not found - ${req.originalUrl}`);
        error.statusCode = 404;
        next(error);
    }

    static asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }
}

module.exports = ErrorHandler;
