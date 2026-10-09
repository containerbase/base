import { readFile, writeFile } from 'node:fs/promises';

// converts the `pnpm audit --json` report into SARIF, so code scanning shows
// the advisories of the root lockfile
// usage: node tools/audit-sarif.ts <audit.json> <output.sarif>

interface Finding {
  version: string;
  paths: string[];
}

interface Advisory {
  title: string;
  module_name: string;
  vulnerable_versions: string;
  patched_versions: string | null;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  cwe: string;
  github_advisory_id: string;
  url: string;
  findings: Finding[];
}

const lockfile = 'pnpm-lock.yaml';

// scores for the code scanning severity: critical >= 9, high >= 7, medium >= 4
const securitySeverity: Record<Advisory['severity'], string> = {
  critical: '9.5',
  high: '8.0',
  moderate: '5.5',
  low: '3.0',
  info: '0.0',
};

const level: Record<Advisory['severity'], string> = {
  critical: 'error',
  high: 'error',
  moderate: 'warning',
  low: 'note',
  info: 'note',
};

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error(
    'usage: node tools/audit-sarif.ts <audit.json> <output.sarif>',
  );
}

const report = JSON.parse(await readFile(input, 'utf8')) as {
  advisories?: Record<string, Advisory>;
};
// pnpm prints an error object instead of a report when the audit fails
if (!report.advisories) {
  throw new Error(`pnpm audit failed: ${JSON.stringify(report)}`);
}

const lines = (await readFile(lockfile, 'utf8')).split('\n');

/** Returns the line of the package entry in the lockfile, or the first line. */
function lockfileLine(name: string, version: string): number {
  const entry = `  ${name}@${version}:`;
  const index = lines.findIndex((line) => line.startsWith(entry));
  return index === -1 ? 1 : index + 1;
}

const advisories = Object.values(report.advisories);

const rules = advisories.map((advisory) => ({
  id: advisory.github_advisory_id,
  name: advisory.module_name,
  shortDescription: { text: advisory.title },
  helpUri: advisory.url,
  help: {
    text: `${advisory.module_name} ${advisory.vulnerable_versions}, patched: ${advisory.patched_versions ?? 'none'}\n${advisory.url}`,
  },
  properties: {
    'security-severity': securitySeverity[advisory.severity],
    tags: ['security', 'dependency', ...advisory.cwe.split(/,\s*/)],
  },
}));

const results = advisories.flatMap((advisory) =>
  advisory.findings.map((finding) => ({
    ruleId: advisory.github_advisory_id,
    level: level[advisory.severity],
    message: {
      text: `${advisory.module_name}@${finding.version}: ${advisory.title} (patched: ${advisory.patched_versions ?? 'none'}), via ${finding.paths.join(', ')}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: lockfile },
          region: {
            startLine: lockfileLine(advisory.module_name, finding.version),
          },
        },
      },
    ],
  })),
);

const sarif = {
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: 'pnpm audit',
          informationUri: 'https://pnpm.io/cli/audit',
          rules,
        },
      },
      results,
    },
  ],
};

await writeFile(output, `${JSON.stringify(sarif, null, 2)}\n`);
console.log(`${results.length} findings from ${rules.length} advisories`);
