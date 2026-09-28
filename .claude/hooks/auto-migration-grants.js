#!/usr/bin/env node
// PostToolUse hook: migration 파일에 CREATE TABLE이 있고 GRANT가 없으면 자동 추가
// Supabase October 30 2026 policy change 대응

const fs = require('fs');

let input = '';
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const { tool_input } = JSON.parse(input);
    const filePath = tool_input?.file_path;

    if (!filePath) process.exit(0);

    // migration 파일만 처리
    if (!/supabase[/\\]migrations[/\\]\d+.*\.sql$/i.test(filePath)) process.exit(0);

    const content = fs.readFileSync(filePath, 'utf8');

    // CREATE TABLE 테이블명 추출
    const tableNames = [...content.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(/gi
    )].map(m => m[1]);

    if (tableNames.length === 0) process.exit(0);

    // 이미 GRANT 있는 테이블 수집
    const alreadyGranted = new Set(
      [...content.matchAll(/GRANT\s+.+?\s+ON\s+(?:TABLE\s+)?(?:public\.)?(\w+)\s+TO/gi)]
        .map(m => m[1].toLowerCase())
    );

    const missing = tableNames.filter(t => !alreadyGranted.has(t.toLowerCase()));
    if (missing.length === 0) process.exit(0);

    // GRANT 문 생성 후 파일에 추가
    const grantBlock = [
      '',
      '-- Data API grants (auto-added by .claude/hooks/auto-migration-grants.js)',
    ];
    for (const table of missing) {
      grantBlock.push(
        '',
        `GRANT ALL ON TABLE ${table} TO service_role;`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${table} TO authenticated;`,
        `GRANT SELECT ON TABLE ${table} TO anon;`
      );
    }

    fs.appendFileSync(filePath, grantBlock.join('\n') + '\n');
    console.error(`[migration-grants] Added grants for: ${missing.join(', ')}`);
  } catch {
    // 훅 실패가 tool 실행을 막으면 안 됨
  }
  process.exit(0);
});
