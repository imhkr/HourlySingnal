import winston from 'winston';
import path from 'path';
import config from '../config';

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `[${timestamp}] ${level}: ${message} ${metaStr}`;
    })
);

// Custom format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
    level: config.app.logLevel,
    transports: [
        // Console output
        new winston.transports.Console({
            format: consoleFormat,
        }),
        // File output - all logs
        new winston.transports.File({
            filename: path.resolve(__dirname, '../../logs/combined.log'),
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // File output - errors only
        new winston.transports.File({
            filename: path.resolve(__dirname, '../../logs/error.log'),
            level: 'error',
            format: fileFormat,
            maxsize: 5242880,
            maxFiles: 5,
        }),
    ],
});

// Helper functions for structured logging
export const log = {
    info: (message: string, meta?: object) => logger.info(message, meta),
    warn: (message: string, meta?: object) => logger.warn(message, meta),
    error: (message: string, meta?: object) => logger.error(message, meta),
    debug: (message: string, meta?: object) => logger.debug(message, meta),

    // Specific log helpers
    news: (action: string, category: string, meta?: object) =>
        logger.info(`[NEWS] ${action}`, { category, ...meta }),

    reflexion: (iteration: number, score: number, passed: boolean) =>
        logger.info(`[REFLEXION] Iteration ${iteration}`, { score, passed }),

    tweet: (action: string, meta?: object) =>
        logger.info(`[TWEET] ${action}`, meta),

    api: (service: string, endpoint: string, status: number) =>
        logger.debug(`[API] ${service}`, { endpoint, status }),
};

export default logger;
