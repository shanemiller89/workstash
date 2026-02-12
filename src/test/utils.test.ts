import * as assert from 'assert';
import { formatRelativeTime } from '../utils';

/**
 * Unit tests for utility functions.
 * 10b-i: formatRelativeTime boundary tests.
 */
suite('Utils — formatRelativeTime', () => {
    /** Helper: create a Date that is `ms` milliseconds in the past */
    function ago(ms: number): Date {
        return new Date(Date.now() - ms);
    }

    const SEC = 1000;
    const MIN = 60 * SEC;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;

    test('0 seconds → "just now"', () => {
        assert.strictEqual(formatRelativeTime(ago(0)), 'just now');
    });

    test('59 seconds → "just now"', () => {
        assert.strictEqual(formatRelativeTime(ago(59 * SEC)), 'just now');
    });

    test('60 seconds → "1 min ago"', () => {
        assert.strictEqual(formatRelativeTime(ago(60 * SEC)), '1 min ago');
    });

    test('59 minutes → "59 min ago"', () => {
        assert.strictEqual(formatRelativeTime(ago(59 * MIN)), '59 min ago');
    });

    test('60 minutes → "1 hour ago"', () => {
        assert.strictEqual(formatRelativeTime(ago(60 * MIN)), '1 hour ago');
    });

    test('2 hours → "2 hours ago"', () => {
        assert.strictEqual(formatRelativeTime(ago(2 * HOUR)), '2 hours ago');
    });

    test('23 hours → "23 hours ago"', () => {
        assert.strictEqual(formatRelativeTime(ago(23 * HOUR)), '23 hours ago');
    });

    test('24 hours → "1 day ago"', () => {
        assert.strictEqual(formatRelativeTime(ago(24 * HOUR)), '1 day ago');
    });

    test('2 days → "2 days ago"', () => {
        assert.strictEqual(formatRelativeTime(ago(2 * DAY)), '2 days ago');
    });

    test('6 days → "6 days ago"', () => {
        assert.strictEqual(formatRelativeTime(ago(6 * DAY)), '6 days ago');
    });

    test('7 days → "Mon DD" format', () => {
        const result = formatRelativeTime(ago(7 * DAY));
        // Should be like "Feb 4" — no "ago" suffix
        assert.ok(!result.includes('ago'), `Expected "Mon DD" format, got "${result}"`);
        assert.ok(
            /[A-Z][a-z]{2} \d{1,2}/.test(result),
            `Expected "Mon DD" format, got "${result}"`,
        );
    });

    test('364 days → "Mon DD" format', () => {
        const result = formatRelativeTime(ago(364 * DAY));
        assert.ok(!result.includes('ago'));
        assert.ok(!result.includes(','), `Should not include year, got "${result}"`);
    });

    test('365 days → "Mon DD, YYYY" format', () => {
        const result = formatRelativeTime(ago(365 * DAY));
        // Should include year: "Feb 12, 2025" style
        assert.ok(result.includes(','), `Expected "Mon DD, YYYY" format, got "${result}"`);
        assert.ok(/\d{4}/.test(result), `Expected year in result, got "${result}"`);
    });

    test('future date → "just now" (edge case)', () => {
        // A date slightly in the future should round to "just now"
        const result = formatRelativeTime(new Date(Date.now() + 1000));
        // diffSec will be negative → < 60, so "just now"
        assert.strictEqual(result, 'just now');
    });
});
