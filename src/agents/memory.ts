import { ReflexionMemory, NewsCategory } from '../types';
import { log } from '../utils/logger';
import fs from 'fs';
import path from 'path';

/**
 * Memory Manager
 * Stores past reflections to help improve future summaries
 */
export class MemoryManager {
    private memories: ReflexionMemory[] = [];
    private readonly maxMemories = 100;
    private readonly memoryFile: string;

    constructor() {
        this.memoryFile = path.resolve(__dirname, '../../memory/reflexion.json');
        this.loadMemories();
    }

    /**
     * Store a new reflection
     */
    store(memory: Omit<ReflexionMemory, 'timestamp'>): void {
        const newMemory: ReflexionMemory = {
            ...memory,
            timestamp: new Date(),
        };

        this.memories.unshift(newMemory);

        // Keep only the most recent memories
        if (this.memories.length > this.maxMemories) {
            this.memories = this.memories.slice(0, this.maxMemories);
        }

        log.debug('Memory stored', {
            category: memory.category,
            improvement: memory.improvement,
        });

        this.saveMemories();
    }

    /**
     * Get recent feedback for a category
     */
    getRecent(category?: NewsCategory, limit: number = 5): string[] {
        let filtered = this.memories;

        if (category) {
            filtered = this.memories.filter(m => m.category === category);
        }

        return filtered
            .slice(0, limit)
            .map(m => m.feedback);
    }

    /**
     * Get improvement statistics
     */
    getStats(): {
        totalReflexions: number;
        averageImprovement: number;
        byCategory: Record<string, number>;
    } {
        const byCategory: Record<string, number> = {};
        let totalImprovement = 0;

        for (const memory of this.memories) {
            totalImprovement += memory.improvement;
            byCategory[memory.category] = (byCategory[memory.category] || 0) + 1;
        }

        return {
            totalReflexions: this.memories.length,
            averageImprovement: this.memories.length > 0
                ? totalImprovement / this.memories.length
                : 0,
            byCategory,
        };
    }

    /**
     * Clear all memories
     */
    clear(): void {
        this.memories = [];
        this.saveMemories();
        log.info('Memory cleared');
    }

    /**
     * Load memories from disk
     */
    private loadMemories(): void {
        try {
            if (fs.existsSync(this.memoryFile)) {
                const data = fs.readFileSync(this.memoryFile, 'utf-8');
                this.memories = JSON.parse(data);
                log.debug('Memories loaded', { count: this.memories.length });
            }
        } catch (error: any) {
            log.warn('Failed to load memories', { error: error.message });
            this.memories = [];
        }
    }

    /**
     * Save memories to disk
     */
    private saveMemories(): void {
        try {
            const dir = path.dirname(this.memoryFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.memoryFile, JSON.stringify(this.memories, null, 2));
        } catch (error: any) {
            log.warn('Failed to save memories', { error: error.message });
        }
    }
}

// Singleton instance
export const memory = new MemoryManager();
export default memory;
