import winston from 'winston';
import path from 'path';
import config from '../config';

const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `[${timestamp}] ${level}: ${message} ${metaStr}`;
    })
);

const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
);

export const logger = winston.createLogger({
    level: config.app.logLevel,
    transports: [
        new winston.transports.Console({
            format: consoleFormat,
        }),
        new winston.transports.File({
            filename: path.resolve(__dirname, '../../logs/combined.log'),
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        new winston.transports.File({
            filename: path.resolve(__dirname, '../../logs/error.log'),
            level: 'error',
            format: fileFormat,
            maxsize: 5242880,
            maxFiles: 5,
        }),
    ],
});

export const log = {
    info: (message: string, meta?: object) => logger.info(message, meta),
    warn: (message: string, meta?: object) => logger.warn(message, meta),
    error: (message: string, meta?: object) => logger.error(message, meta),
    debug: (message: string, meta?: object) => logger.debug(message, meta),

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
