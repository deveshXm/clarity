/**
 * Push the eval datasets to LangWatch so they can be browsed, annotated and
 * grown from real traces in the UI.
 *
 * The TypeScript files next to this one stay the source of truth: the
 * experiments read from them directly, so a run never depends on the network
 * for its inputs. Re-run this after editing a dataset. Existing records are
 * replaced, not appended.
 *
 * Run:  npm run evals:datasets
 */
import { langwatchClient } from '../client';
import { CASES as FLAGGING } from './flagging';
import { PERSONAS, STYLE_CASES } from './style';
import { REPHRASE_CASES } from './rephrase';

type Column = { name: string; type: 'string' | 'number' | 'boolean' };
type Row = Record<string, string | number | boolean>;

const json = (v: unknown) => JSON.stringify(v);

const DATASETS: Array<{ name: string; columns: Column[]; rows: Row[] }> = [
    {
        name: 'clarity-flagging',
        columns: [
            { name: 'id', type: 'number' },
            { name: 'message', type: 'string' },
            { name: 'type', type: 'string' },
            { name: 'expected_flags', type: 'string' },
            { name: 'expect_harmful', type: 'boolean' },
            { name: 'workspace', type: 'string' },
            { name: 'channel', type: 'string' },
            { name: 'persona', type: 'string' },
            { name: 'context', type: 'string' },
        ],
        rows: FLAGGING.map(c => ({
            id: c.id,
            message: c.message,
            type: c.type,
            expected_flags: json(c.expectedFlags),
            expect_harmful: c.expectHarmful,
            workspace: c.workspace,
            channel: c.channel,
            persona: c.persona,
            context: json(c.context ?? []),
        })),
    },
    {
        name: 'clarity-style-personas',
        columns: [
            { name: 'id', type: 'string' },
            { name: 'truth', type: 'string' },
            { name: 'poor', type: 'boolean' },
            { name: 'thin', type: 'boolean' },
            { name: 'messages', type: 'string' },
        ],
        rows: PERSONAS.map(p => ({
            id: p.id,
            truth: p.truth,
            poor: !!p.poor,
            thin: !!p.thin,
            messages: json(p.messages),
        })),
    },
    {
        name: 'clarity-style-deviation',
        columns: [
            { name: 'id', type: 'string' },
            { name: 'pair', type: 'string' },
            { name: 'target_key', type: 'string' },
            { name: 'target', type: 'string' },
            { name: 'expected_band', type: 'string' },
            { name: 'note', type: 'string' },
            { name: 'messages', type: 'string' },
        ],
        rows: STYLE_CASES.map(c => ({
            id: c.id,
            pair: c.pair ?? '',
            target_key: c.targetKey,
            target: c.target,
            expected_band: c.band,
            note: c.note,
            messages: json(c.messages),
        })),
    },
    {
        name: 'clarity-rephrase',
        columns: [
            { name: 'id', type: 'string' },
            { name: 'message', type: 'string' },
            { name: 'expected_flag', type: 'string' },
            { name: 'must_retain', type: 'string' },
            { name: 'style_key', type: 'string' },
            { name: 'style', type: 'string' },
            { name: 'context', type: 'string' },
        ],
        rows: REPHRASE_CASES.map(c => ({
            id: c.id,
            message: c.message,
            expected_flag: c.expectedFlag,
            must_retain: c.mustRetain,
            style_key: c.styleKey ?? '',
            style: c.style ?? '',
            context: json(c.context ?? []),
        })),
    },
];

async function main() {
    const lw = langwatchClient();
    const existing = (await lw.datasets.list({ limit: 100 })).data;

    for (const ds of DATASETS) {
        const found = existing.find(d => d.name === ds.name || d.slug === ds.name);
        let slug: string;
        if (found) {
            slug = found.slug;
            await lw.datasets.update(slug, { columnTypes: ds.columns });
            // Replace, don't append: wipe the current records first.
            let removed = 0;
            for (;;) {
                const page = await lw.datasets.listRecords(slug, { limit: 200 });
                if (!page.data.length) break;
                const res = await lw.datasets.deleteRecords(slug, page.data.map(r => r.id));
                removed += res.deletedCount;
                if (res.deletedCount === 0) break;
            }
            console.log(`  ↻ ${ds.name} (${slug}): cleared ${removed} records`);
        } else {
            const info = await lw.datasets.create({ name: ds.name, columnTypes: ds.columns });
            slug = info.slug;
            console.log(`  + ${ds.name} (${slug}): created`);
        }
        const res = await lw.datasets.createRecords(slug, ds.rows);
        console.log(`    ${res.data.length} records pushed`);
    }
    console.log('\nDone. Browse them: langwatch open datasets');
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
