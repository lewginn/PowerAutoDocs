import { describe, it, expect } from 'vitest';
import { generateMermaidDiagram } from '../../src/enrichment/mermaidGenerator.js';
import { aTrigger } from '../fixtures/ir.js';

// The generator walks the *raw* Power Automate action JSON, not the IR — so the
// fixtures here are hand-built synthetic Logic App trees. Shape reference:
//   { Action_Key: { type, runAfter: { Other_Key: ['Succeeded'] }, actions?, else?, cases? } }
const lines = (dsl: string): string[] => dsl.split('\n');

/** Every edge line in the diagram, in emission order. */
const edges = (dsl: string): string[] => lines(dsl).filter(l => l.includes('-->'));

/** Every node-definition line (everything that isn't the header or an edge). */
const nodes = (dsl: string): string[] =>
  lines(dsl).filter(l => l !== 'flowchart TD' && !l.includes('-->'));

/** The node id from a node-definition line, e.g. '  N10{"Check"}' → 'N10'. */
const idOf = (line: string): string => {
  const m = /^\s*(N\d+)/.exec(line);
  if (!m) throw new Error(`not a node line: ${JSON.stringify(line)}`);
  return m[1];
};

/** A single leaf action with no dependencies. */
const act = (type?: string, extra: Record<string, unknown> = {}) => ({
  ...(type !== undefined ? { type } : {}),
  runAfter: {},
  ...extra,
});

describe('generateMermaidDiagram — output contract', () => {
  it('returns raw DSL with no fence — the serializer owns the fence', () => {
    // MarkdownSerializer.ts:83-84 wraps mermaid nodes in :::mermaid ... :::.
    // A fence baked in here shipped a bug where every diagram rendered as
    // literal ':::mermaid' text in the wiki. Pin the boundary explicitly.
    const dsl = generateMermaidDiagram(aTrigger(), { Compose_It: act('Compose') });
    expect(dsl.startsWith(':::')).toBe(false);
    expect(dsl.startsWith('```')).toBe(false);
    expect(dsl).not.toContain(':::');
    expect(dsl).not.toContain('```');
  });

  it('starts with the flowchart TD header', () => {
    expect(lines(generateMermaidDiagram(aTrigger(), {}))[0]).toBe('flowchart TD');
  });

  it('emits only the trigger node when the flow has no actions', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {});
    expect(lines(dsl)).toEqual(['flowchart TD', '  N0(["DataverseCreate: acme_widget"])']);
    expect(edges(dsl)).toEqual([]);
  });
});

describe('generateMermaidDiagram — trigger node', () => {
  it('uses the stadium shape so the entry point is visually distinct', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {});
    expect(lines(dsl)).toContain('  N0(["DataverseCreate: acme_widget"])');
  });

  it('appends the entity when the trigger targets a table', () => {
    const dsl = generateMermaidDiagram(aTrigger({ type: 'DataverseUpdate', entity: 'acme_part' }), {});
    expect(lines(dsl)).toContain('  N0(["DataverseUpdate: acme_part"])');
  });

  it('shows the type alone when there is no entity', () => {
    // Manual and Scheduled triggers carry no entity at all.
    const dsl = generateMermaidDiagram(aTrigger({ type: 'Scheduled', entity: undefined }), {});
    expect(lines(dsl)).toContain('  N0(["Scheduled"])');
  });

  it('treats an empty-string entity as absent rather than emitting a dangling colon', () => {
    const dsl = generateMermaidDiagram(aTrigger({ type: 'Manual', entity: '' }), {});
    expect(lines(dsl)).toContain('  N0(["Manual"])');
    expect(lines(dsl)).not.toContain('  N0(["Manual: "])');
  });
});

describe('generateMermaidDiagram — node shapes', () => {
  // ADO Wiki is pinned to Mermaid 8.14, so these shapes are load-bearing:
  // anything newer (cylinder, hexagon) renders as a parse error, not a node.
  const shapeOf = (type: string | undefined, key = 'Do_It'): string =>
    nodes(generateMermaidDiagram(aTrigger(), { [key]: act(type) }))[1];

  it('draws an If as a diamond', () => {
    expect(shapeOf('If')).toBe('  N1{"Do It"}');
  });

  it('draws a Scope as a subroutine box', () => {
    expect(shapeOf('Scope')).toBe('  N1[["Do It"]]');
  });

  it('draws a Foreach as a rectangle carrying the loop glyph', () => {
    // Mermaid 8.14 has no cylinder, so the glyph is what marks it as a loop.
    expect(shapeOf('Foreach')).toBe('  N1["↺ Do It"]');
  });

  it('draws a Terminate as a circle', () => {
    expect(shapeOf('Terminate')).toBe('  N1(("Do It"))');
  });

  it('falls back to a plain rectangle for any other action type', () => {
    expect(shapeOf('OpenApiConnection')).toBe('  N1["Do It"]');
    expect(shapeOf('SomeFutureConnectorType')).toBe('  N1["Do It"]');
  });

  it('falls back to a rectangle when the action has no type at all', () => {
    // Malformed or hand-edited flow JSON must not take the whole run down.
    expect(() => generateMermaidDiagram(aTrigger(), { Do_It: { runAfter: {} } })).not.toThrow();
    expect(shapeOf(undefined)).toBe('  N1["Do It"]');
  });

  it('humanises the action key by replacing underscores with spaces', () => {
    // Power Automate stores action names with spaces as underscores.
    expect(shapeOf('Compose', 'Get_the_User_ID')).toBe('  N1["Get the User ID"]');
  });

  it('downgrades double quotes in a label to single quotes', () => {
    // A raw " inside a "..." label terminates it early and makes the whole
    // diagram unparseable — every node after it disappears.
    expect(shapeOf('Compose', 'Send_"urgent"_mail')).toBe(`  N1["Send 'urgent' mail"]`);
  });

  it('escapes quotes inside every shape, not just the default one', () => {
    expect(shapeOf('If', 'Is_"VIP"')).toBe(`  N1{"Is 'VIP'"}`);
    expect(shapeOf('Scope', 'Try_"once"')).toBe(`  N1[["Try 'once'"]]`);
    expect(shapeOf('Foreach', 'Each_"row"')).toBe(`  N1["↺ Each 'row'"]`);
    expect(shapeOf('Terminate', 'Stop_"now"')).toBe(`  N1(("Stop 'now'"))`);
  });
});

describe('generateMermaidDiagram — runAfter edges', () => {
  const chain = (statuses: string[]): string[] =>
    edges(generateMermaidDiagram(aTrigger(), {
      First: act('Compose'),
      Second: { type: 'Compose', runAfter: { First: statuses } },
    }));

  it('draws an unlabelled edge for a plain success dependency', () => {
    expect(chain(['Succeeded'])).toEqual(['  N1 --> N2', '  N0 --> N1']);
  });

  it('flags an edge as an error path when no status is Succeeded', () => {
    // This is the Try/Catch pattern — mislabelling it as a normal edge would
    // read as "this always runs next", which is the opposite of the truth.
    // toEqual, not toContain: a plain '  N1 --> N2' emitted *alongside* the
    // error edge would satisfy toContain while drawing a lie in the diagram.
    expect(chain(['Failed'])).toEqual(['  N1 -->|"⚠ Error"| N2', '  N0 --> N1']);
    expect(chain(['Failed', 'TimedOut', 'Skipped'])).toEqual([
      '  N1 -->|"⚠ Error"| N2',
      '  N0 --> N1',
    ]);
  });

  it('labels a mixed dependency as Any rather than picking a side', () => {
    expect(chain(['Succeeded', 'Failed'])).toEqual(['  N1 -->|"Any"| N2', '  N0 --> N1']);
    expect(chain(['Succeeded', 'Failed', 'Skipped'])).toEqual([
      '  N1 -->|"Any"| N2',
      '  N0 --> N1',
    ]);
  });

  it('treats a lone Succeeded as plain, not mixed', () => {
    expect(chain(['Succeeded'])).toContain('  N1 --> N2');
    expect(chain(['Succeeded']).some(l => l.includes('Any'))).toBe(false);
  });

  it('treats an empty status array as a plain edge', () => {
    expect(chain([])).toContain('  N1 --> N2');
  });

  it('fans out one action to several dependents', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      First: act('Compose'),
      Left: { type: 'Compose', runAfter: { First: ['Succeeded'] } },
      Right: { type: 'Compose', runAfter: { First: ['Failed'] } },
    });
    expect(edges(dsl)).toContain('  N1 --> N2');
    expect(edges(dsl)).toContain('  N1 -->|"⚠ Error"| N3');
  });

  it('joins an action that waits on two predecessors', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Left: act('Compose'),
      Right: act('Compose'),
      Join: { type: 'Compose', runAfter: { Left: ['Succeeded'], Right: ['Succeeded'] } },
    });
    expect(edges(dsl)).toContain('  N1 --> N3');
    expect(edges(dsl)).toContain('  N2 --> N3');
  });

  it('skips a runAfter pointing at a key that does not exist without crashing', () => {
    // Truncated or hand-edited definition.json — drop the edge, keep the diagram.
    let dsl = '';
    expect(() => {
      dsl = generateMermaidDiagram(aTrigger(), {
        Orphan: { type: 'Compose', runAfter: { Ghost_Action: ['Succeeded'] } },
      });
    }).not.toThrow();
    expect(nodes(dsl)).toContain('  N1["Orphan"]');
    expect(edges(dsl)).toEqual([]);
  });

  it('keeps the resolvable half of a runAfter when a sibling reference is dangling', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      First: act('Compose'),
      Second: { type: 'Compose', runAfter: { First: ['Succeeded'], Ghost: ['Succeeded'] } },
    });
    expect(edges(dsl)).toContain('  N1 --> N2');
  });
});

describe('generateMermaidDiagram — trigger to top-level roots', () => {
  it('connects the trigger to the single first action', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      First: act('Compose'),
      Second: { type: 'Compose', runAfter: { First: ['Succeeded'] } },
    });
    expect(edges(dsl)).toContain('  N0 --> N1');
    expect(edges(dsl)).not.toContain('  N0 --> N2');
  });

  it('connects the trigger to every parallel branch root', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Branch_A: act('Compose'),
      Branch_B: act('Compose'),
    });
    expect(edges(dsl)).toEqual(['  N0 --> N1', '  N0 --> N2']);
  });

  it('does not connect the trigger to actions that wait on a sibling', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      First: act('Compose'),
      Second: { type: 'Compose', runAfter: { First: ['Failed'] } },
    });
    expect(edges(dsl).filter(l => l.startsWith('  N0'))).toEqual(['  N0 --> N1']);
  });
});

describe('generateMermaidDiagram — If branches', () => {
  it('labels the true branch Yes and the else branch No', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Check_Tier: {
        type: 'If',
        runAfter: {},
        actions: { Approve: act('Compose') },
        else: { actions: { Reject: act('Terminate') } },
      },
    });
    expect(nodes(dsl)).toEqual([
      '  N0(["DataverseCreate: acme_widget"])',
      '  N1{"Check Tier"}',
      '  N2["Approve"]',
      '  N3(("Reject"))',
    ]);
    expect(edges(dsl)).toContain('  N1 -->|"Yes"| N2');
    expect(edges(dsl)).toContain('  N1 -->|"No"| N3');
  });

  it('branches only to the root of each branch, then follows runAfter inside it', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Check: {
        type: 'If',
        runAfter: {},
        actions: {
          Step_One: act('Compose'),
          Step_Two: { type: 'Compose', runAfter: { Step_One: ['Succeeded'] } },
        },
      },
    });
    expect(edges(dsl)).toContain('  N1 -->|"Yes"| N2');
    expect(edges(dsl)).toContain('  N2 --> N3');
    expect(edges(dsl)).not.toContain('  N1 -->|"Yes"| N3');
  });

  it('omits the No edge when the If has no else block', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Check: { type: 'If', runAfter: {}, actions: { Approve: act('Compose') } },
    });
    expect(edges(dsl).some(l => l.includes('"No"'))).toBe(false);
  });

  it('omits both branch edges when the If is empty on both sides', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Check: { type: 'If', runAfter: {}, actions: {}, else: { actions: {} } },
    });
    expect(nodes(dsl)).toContain('  N1{"Check"}');
    expect(edges(dsl)).toEqual(['  N0 --> N1']);
  });

  it('draws the No edge for an If that has only an else block', () => {
    // A guard-clause condition — empty Yes side, all the work on No. The true
    // and false branches are independent code paths in the generator, so an
    // else-only If is not covered by the Yes-side tests above.
    const dsl = generateMermaidDiagram(aTrigger(), {
      Check: { type: 'If', runAfter: {}, else: { actions: { Bail: act('Terminate') } } },
    });
    expect(nodes(dsl)).toEqual([
      '  N0(["DataverseCreate: acme_widget"])',
      '  N1{"Check"}',
      '  N2(("Bail"))',
    ]);
    expect(edges(dsl)).toEqual(['  N1 -->|"No"| N2', '  N0 --> N1']);
    expect(edges(dsl).some(l => l.includes('"Yes"'))).toBe(false);
  });

  it('recurses into a container nested inside an If branch', () => {
    // If → Scope → leaf. The Scope recursion is driven by a separate loop from
    // the If recursion; this is the only test that proves one reaches the other.
    const dsl = generateMermaidDiagram(aTrigger(), {
      Check: {
        type: 'If',
        runAfter: {},
        actions: {
          Try: { type: 'Scope', runAfter: {}, actions: { Log_It: act('Compose') } },
        },
      },
    });
    expect(nodes(dsl)).toEqual([
      '  N0(["DataverseCreate: acme_widget"])',
      '  N1{"Check"}',
      '  N2[["Try"]]',
      '  N3["Log It"]',
    ]);
    expect(edges(dsl)).toEqual(['  N2 --> N3', '  N1 -->|"Yes"| N2', '  N0 --> N1']);
  });

  it('handles an If with no actions key at all', () => {
    let dsl = '';
    expect(() => {
      dsl = generateMermaidDiagram(aTrigger(), { Check: { type: 'If', runAfter: {} } });
    }).not.toThrow();
    expect(edges(dsl)).toEqual(['  N0 --> N1']);
  });
});

describe('generateMermaidDiagram — containers', () => {
  it('connects a Scope to its inner root with a plain edge', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Try: { type: 'Scope', runAfter: {}, actions: { Risky_Call: act('OpenApiConnection') } },
    });
    expect(nodes(dsl)).toContain('  N1[["Try"]]');
    expect(nodes(dsl)).toContain('  N2["Risky Call"]');
    expect(edges(dsl)).toContain('  N1 --> N2');
  });

  it('connects a Foreach to its inner root with a plain edge', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Apply_to_each: { type: 'Foreach', runAfter: {}, actions: { Update_Row: act('OpenApiConnection') } },
    });
    expect(nodes(dsl)).toContain('  N1["↺ Apply to each"]');
    expect(edges(dsl)).toContain('  N1 --> N2');
  });

  it('connects a container to every parallel root inside it', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Try: { type: 'Scope', runAfter: {}, actions: { A: act('Compose'), B: act('Compose') } },
    });
    expect(edges(dsl)).toContain('  N1 --> N2');
    expect(edges(dsl)).toContain('  N1 --> N3');
  });

  it('emits no inner edge for an empty container', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Try: { type: 'Scope', runAfter: {}, actions: {} },
    });
    expect(edges(dsl)).toEqual(['  N0 --> N1']);
  });

  it('wires a Catch scope to a Try scope as an error path', () => {
    // The canonical Power Automate Try/Catch shape, end to end.
    const dsl = generateMermaidDiagram(aTrigger(), {
      Try: { type: 'Scope', runAfter: {}, actions: { Risky_Call: act('OpenApiConnection') } },
      Catch: {
        type: 'Scope',
        runAfter: { Try: ['Failed', 'TimedOut'] },
        actions: { Log_Error: act('Compose') },
      },
    });
    expect(edges(dsl)).toContain('  N0 --> N1');
    expect(edges(dsl)).toContain('  N1 -->|"⚠ Error"| N2');
    expect(edges(dsl)).toContain('  N1 --> N3'); // Try → Risky Call
    expect(edges(dsl)).toContain('  N2 --> N4'); // Catch → Log Error
  });
});

describe('generateMermaidDiagram — nesting and node identity', () => {
  it('gives ids sequentially from N0, with the trigger first', () => {
    const dsl = generateMermaidDiagram(aTrigger(), { A: act('Compose'), B: act('Compose') });
    expect(nodes(dsl).map(idOf)).toEqual(['N0', 'N1', 'N2']);
  });

  it('keeps numbering correct past the single-digit boundary', () => {
    // A 12-action flow is unremarkable in the field. Reading the id with a
    // fixed-width slice would silently truncate N10+ to 'N1' and let a
    // duplicate-id regression through, so the id is parsed, not sliced.
    const many = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`Step_${i}`, act('Compose')]),
    );
    const ids = nodes(generateMermaidDiagram(aTrigger(), many)).map(idOf);
    expect(ids).toEqual(Array.from({ length: 13 }, (_, i) => `N${i}`));
    expect(new Set(ids).size).toBe(13);
  });

  it('gives the same action key at two levels distinct ids', () => {
    // The dotted-path keying exists for exactly this: 'root.Notify' and
    // 'root.Try.inner.Notify' are different nodes that happen to share a name.
    const dsl = generateMermaidDiagram(aTrigger(), {
      Notify: act('Compose'),
      Try: {
        type: 'Scope',
        runAfter: { Notify: ['Succeeded'] },
        actions: { Notify: act('Compose') },
      },
    });
    // Two separate "Notify" rectangles, not one reused node.
    expect(nodes(dsl).filter(l => l.includes('"Notify"'))).toEqual(['  N1["Notify"]', '  N3["Notify"]']);
    // The trigger must reach the OUTER Notify. Keying by bare action name would
    // let the inner one overwrite the outer in the id map, and the trigger edge
    // (drawn last, after all recursion) would land inside the Scope instead.
    expect(edges(dsl)).toContain('  N0 --> N1');
    expect(edges(dsl)).not.toContain('  N0 --> N3');
    expect(edges(dsl)).toContain('  N1 --> N2'); // outer Notify → Try
    expect(edges(dsl)).toContain('  N2 --> N3'); // Try → inner Notify
  });

  it('keeps sibling containers that share inner action keys separate', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Try: { type: 'Scope', runAfter: {}, actions: { Log: act('Compose') } },
      Catch: { type: 'Scope', runAfter: { Try: ['Failed'] }, actions: { Log: act('Compose') } },
    });
    expect(nodes(dsl).filter(l => l.includes('"Log"'))).toHaveLength(2);
    expect(edges(dsl)).toContain('  N1 --> N3'); // Try → its own Log
    expect(edges(dsl)).toContain('  N2 --> N4'); // Catch → its own Log
    expect(edges(dsl)).not.toContain('  N1 --> N4');
  });

  it('walks an If nested inside a Scope down to the leaves', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Try: {
        type: 'Scope',
        runAfter: {},
        actions: {
          Check: {
            type: 'If',
            runAfter: {},
            actions: { Do_It: act('Compose') },
            else: { actions: { Bail: act('Terminate') } },
          },
        },
      },
    });
    expect(nodes(dsl)).toEqual([
      '  N0(["DataverseCreate: acme_widget"])',
      '  N1[["Try"]]',
      '  N2{"Check"}',
      '  N3["Do It"]',
      '  N4(("Bail"))',
    ]);
    expect(edges(dsl)).toEqual([
      '  N2 -->|"Yes"| N3',
      '  N2 -->|"No"| N4',
      '  N1 --> N2',
      '  N0 --> N1',
    ]);
  });

  it('keeps ids unique three levels deep with a repeated key at every level', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Log: act('Compose'),
      Try: {
        type: 'Scope',
        runAfter: { Log: ['Succeeded'] },
        actions: {
          Log: act('Compose'),
          Check: {
            type: 'If',
            runAfter: { Log: ['Succeeded'] },
            actions: { Log: act('Compose') },
          },
        },
      },
    });
    const ids = nodes(dsl).map(idOf);
    expect(new Set(ids).size).toBe(ids.length);
    // Each level's runAfter resolves against its OWN sibling Log, not another level's.
    expect(edges(dsl)).toContain('  N1 --> N2'); // root Log → Try
    expect(edges(dsl)).toContain('  N3 --> N4'); // Try's Log → Check
    expect(edges(dsl)).toContain('  N4 -->|"Yes"| N5'); // Check → its own Log
  });
});

describe('generateMermaidDiagram — Switch and Until', () => {
  it('draws every Switch case and the default branch, labelled by case name', () => {
    // Was pinned: flowParser.ts recurses into cases and default, so the flow's
    // action TABLE always listed these actions while the diagram silently
    // omitted them — the Switch rendered as a dead-end box, understating what
    // the flow actually does.
    const dsl = generateMermaidDiagram(aTrigger(), {
      Switch_on_Tier: {
        type: 'Switch',
        runAfter: {},
        cases: { Gold: { actions: { Send_Gift: act('Compose') } } },
        default: { actions: { Do_Nothing: act('Compose') } },
      },
    });
    expect(nodes(dsl)).toEqual([
      '  N0(["DataverseCreate: acme_widget"])',
      '  N1["Switch on Tier"]',
      '  N2["Send Gift"]',
      '  N3["Do Nothing"]',
    ]);
    expect(edges(dsl)).toEqual([
      '  N1 -->|"Gold"| N2',
      '  N1 -->|"Default"| N3',
      '  N0 --> N1',
    ]);
  });

  it('omits a case with no actions rather than drawing an empty branch', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Switch_on_Tier: {
        type: 'Switch',
        runAfter: {},
        cases: { Empty: { actions: {} } },
      },
    });
    expect(nodes(dsl)).toEqual([
      '  N0(["DataverseCreate: acme_widget"])',
      '  N1["Switch on Tier"]',
    ]);
    expect(edges(dsl)).toEqual(['  N0 --> N1']);
  });

  it('draws an Until loop body and marks it with the loop glyph', () => {
    // Was pinned: flowParser.ts:52 maps Until → 'Loop — until', so the codebase
    // knew the type existed; the generator neither recursed into it nor marked
    // it as a loop. A polling loop — a common Power Automate pattern — drew as
    // a single ordinary step with no indication it loops and no visible body.
    const dsl = generateMermaidDiagram(aTrigger(), {
      Do_until: { type: 'Until', runAfter: {}, actions: { Poll_Status: act('Compose') } },
    });
    expect(nodes(dsl)).toEqual([
      '  N0(["DataverseCreate: acme_widget"])',
      '  N1["↺ Do until"]',
      '  N2["Poll Status"]',
    ]);
    expect(edges(dsl)).toEqual([
      '  N1 --> N2',
      '  N0 --> N1',
    ]);
  });

  it('draws an empty Until loop with the glyph but no body edge', () => {
    const dsl = generateMermaidDiagram(aTrigger(), {
      Do_until: { type: 'Until', runAfter: {}, actions: {} },
    });
    expect(nodes(dsl)).toEqual([
      '  N0(["DataverseCreate: acme_widget"])',
      '  N1["↺ Do until"]',
    ]);
    expect(edges(dsl)).toEqual(['  N0 --> N1']);
  });
});

describe('generateMermaidDiagram — trigger label escaping', () => {
  it('escapes double quotes in the trigger label like every action label', () => {
    // Was pinned: nodeDef() escapes " → ' for every action label, but the
    // trigger node is built inline and bypassed it. trigger.entity comes
    // straight from unvalidated flow JSON, so a quote in it terminated the
    // Mermaid string literal early and broke the WHOLE diagram, not just the
    // trigger node — worse blast radius than any single action label bug.
    const dsl = generateMermaidDiagram(aTrigger({ entity: 'acme_"odd"' }), {});
    expect(lines(dsl)).toContain(`  N0(["DataverseCreate: acme_'odd'"])`);
    expect(dsl).not.toContain('acme_"odd"');
  });
});
