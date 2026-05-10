import { describe, it, expect } from 'vitest';
import {
  parseCommand,
  filterCommands,
  SLASH_COMMANDS,
} from '../lib/terminal/commands';

describe('parseCommand', () => {
  it('returns kind=free for plain text', () => {
    const result = parseCommand('what should I ship next?');
    expect(result.kind).toBe('free');
    if (result.kind === 'free') {
      expect(result.apiText).toBe('what should I ship next?');
      expect(result.raw).toBe('what should I ship next?');
    }
  });

  it('treats unknown slash commands as free text (sent verbatim)', () => {
    const result = parseCommand('/foobar do something');
    expect(result.kind).toBe('free');
    if (result.kind === 'free') {
      // Sent verbatim — user typed it deliberately, we don't swallow it.
      expect(result.apiText).toBe('/foobar do something');
    }
  });

  it('routes /help to a local command', () => {
    const result = parseCommand('/help');
    expect(result.kind).toBe('local');
    if (result.kind === 'local') {
      expect(result.command.name).toBe('/help');
      expect(result.command.isLocal).toBe(true);
    }
  });

  it('routes /clear to a local command', () => {
    const result = parseCommand('/clear');
    expect(result.kind).toBe('local');
    if (result.kind === 'local') {
      expect(result.command.name).toBe('/clear');
    }
  });

  it('routes /history to a local command', () => {
    const result = parseCommand('/history');
    expect(result.kind).toBe('local');
  });

  it('routes /analyze with a project arg to a slash command', () => {
    const result = parseCommand('/analyze sublime');
    expect(result.kind).toBe('slash');
    if (result.kind === 'slash') {
      expect(result.command.name).toBe('/analyze');
      expect(result.args).toBe('sublime');
      // Directive must name the tool + the project explicitly so Gemini
      // doesn't drop into "which project?" follow-ups.
      expect(result.apiText).toContain('analyze_code');
      expect(result.apiText).toContain('"sublime"');
      expect(result.apiText).toContain('terminal mode');
    }
  });

  it('routes /analyze with no arg to a slash command using "main project" placeholder', () => {
    const result = parseCommand('/analyze');
    expect(result.kind).toBe('slash');
    if (result.kind === 'slash') {
      expect(result.args).toBe('');
      // Falls back to "main project" so the directive is still complete.
      expect(result.apiText).toContain("the user's main project");
    }
  });

  it('handles multi-word project names in args', () => {
    const result = parseCommand('/analyze my big project');
    expect(result.kind).toBe('slash');
    if (result.kind === 'slash') {
      expect(result.args).toBe('my big project');
      expect(result.apiText).toContain('"my big project"');
    }
  });

  it('trims surrounding whitespace from input', () => {
    const result = parseCommand('   /projects   ');
    expect(result.kind).toBe('slash');
    if (result.kind === 'slash') {
      expect(result.command.name).toBe('/projects');
    }
  });

  it('returns free for empty input', () => {
    const result = parseCommand('');
    expect(result.kind).toBe('free');
    if (result.kind === 'free') {
      expect(result.apiText).toBe('');
    }
  });
});

describe('filterCommands', () => {
  it('returns matches by name prefix', () => {
    const results = filterCommands('/an');
    const names = results.map((c) => c.name);
    expect(names).toContain('/analyze');
    expect(names).toContain('/analytics');
    expect(names).not.toContain('/projects');
  });

  it('returns the full registry for a bare slash', () => {
    const results = filterCommands('/');
    expect(results.length).toBe(SLASH_COMMANDS.length);
  });

  it('returns an empty list for non-slash input', () => {
    expect(filterCommands('analyze')).toEqual([]);
    expect(filterCommands('')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const results = filterCommands('/AN');
    const names = results.map((c) => c.name);
    expect(names).toContain('/analyze');
  });
});
