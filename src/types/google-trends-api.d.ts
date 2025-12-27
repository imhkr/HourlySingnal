declare module 'google-trends-api' {
    export function realTimeTrends(options: {
        geo: string;
        category?: string;
    }): Promise<string>;

    export default {
        realTimeTrends
    };
}
