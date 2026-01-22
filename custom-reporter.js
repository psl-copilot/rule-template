// SPDX-License-Identifier: Apache-2.0

const fs = require('fs');
const path = require('path');

class TazamaHtmlReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }

  getCoverageClass(pct) {
    if (pct >= 90) return 'high';
    if (pct >= 70) return 'medium';
    return 'low';
  }

  formatPct(value) {
    if (value === undefined || value === null || isNaN(value)) {
      return 'Unknown';
    }
    // Handle string "Unknown" from coverage data
    if (typeof value === 'string') {
      return value;
    }
    return value.toFixed(2) + '%';
  }

  onRunComplete(contexts, results) {
    const outputPath = this._options.outputPath || 'reports/unit-tests/latest/index.html';
    const dir = path.dirname(outputPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read coverage summary for percentages
    let coverageData = null;
    const coverageSummaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
    if (fs.existsSync(coverageSummaryPath)) {
      try {
        const rawData = fs.readFileSync(coverageSummaryPath, 'utf8');
        coverageData = JSON.parse(rawData);
        console.log('✅ Coverage summary loaded successfully');
        console.log('Total coverage:', {
          statements: coverageData.total?.statements?.pct,
          branches: coverageData.total?.branches?.pct,
          functions: coverageData.total?.functions?.pct,
          lines: coverageData.total?.lines?.pct,
        });
      } catch (e) {
        console.log('❌ Error reading coverage summary:', e.message);
      }
    } else {
      console.log('⚠️  Coverage summary file not found at:', coverageSummaryPath);
    }

    // Read detailed coverage for uncovered lines
    let detailedCoverage = null;
    const coverageFinalPath = path.join(process.cwd(), 'coverage', 'coverage-final.json');
    if (fs.existsSync(coverageFinalPath)) {
      try {
        detailedCoverage = JSON.parse(fs.readFileSync(coverageFinalPath, 'utf8'));
      } catch (e) {
        console.log('Could not read detailed coverage');
      }
    }

    const html = this.generateHTML(results, coverageData, detailedCoverage);
    fs.writeFileSync(outputPath, html);
    console.log('\n📊 Tazama Test Report generated: ' + outputPath);
  }

  // Extract uncovered line numbers from detailed coverage
  getUncoveredLines(detailedCoverage, filePath) {
    if (!detailedCoverage) return '';

    // Find matching file in detailed coverage
    const fileKey = Object.keys(detailedCoverage).find(function (key) {
      return key.includes(path.basename(filePath)) || filePath.includes(path.basename(key));
    });

    if (!fileKey) return '';

    const fileData = detailedCoverage[fileKey];
    if (!fileData || !fileData.statementMap || !fileData.s) return '';

    const uncoveredLines = [];
    const statementMap = fileData.statementMap;
    const statementCoverage = fileData.s;

    // Find statements with 0 coverage
    Object.keys(statementCoverage).forEach(function (stmtId) {
      if (statementCoverage[stmtId] === 0) {
        const stmt = statementMap[stmtId];
        if (stmt && stmt.start && stmt.start.line) {
          const line = stmt.start.line;
          if (uncoveredLines.indexOf(line) === -1) {
            uncoveredLines.push(line);
          }
        }
      }
    });

    if (uncoveredLines.length === 0) return '';

    // Sort and format as ranges (e.g., "45-46, 52, 60-62")
    uncoveredLines.sort(function (a, b) {
      return a - b;
    });

    const ranges = [];
    let start = uncoveredLines[0];
    let end = uncoveredLines[0];

    for (let i = 1; i < uncoveredLines.length; i++) {
      if (uncoveredLines[i] === end + 1) {
        end = uncoveredLines[i];
      } else {
        ranges.push(start === end ? String(start) : start + '-' + end);
        start = uncoveredLines[i];
        end = uncoveredLines[i];
      }
    }
    ranges.push(start === end ? String(start) : start + '-' + end);

    return ranges.join(', ');
  }

  generateHTML(results, coverageData, detailedCoverage) {
    const numTotalTests = results.numTotalTests;
    const numPassedTests = results.numPassedTests;
    const numFailedTests = results.numFailedTests;
    const numTotalTestSuites = results.numTotalTestSuites;
    const numPassedTestSuites = results.numPassedTestSuites;
    const startTime = results.startTime;
    const testResults = results.testResults;

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);
    const timestamp = new Date().toLocaleString();

    // Build test cards HTML
    let testCardsHTML = '';
    testResults.forEach(function (testResult) {
      testResult.testResults.forEach(function (test) {
        if (test.title) {
          const icon = test.status === 'passed' ? '✅' : '❌';
          const statusClass = test.status === 'passed' ? 'passed' : 'failed';
          testCardsHTML +=
            '<div class="test-card ' +
            statusClass +
            '">' +
            '<span class="test-icon">' +
            icon +
            '</span>' +
            '<span class="test-name">' +
            test.title +
            '</span>' +
            '<span class="test-duration">' +
            (test.duration || 0) +
            'ms</span>' +
            '</div>';
        }
      });
    });

    // Build coverage table HTML
    let coverageTableHTML =
      '<div class="coverage-section"><h2>📊 Code Coverage</h2><p style="color:#666;">No coverage data available.</p></div>';

    if (coverageData && coverageData.total) {
      const total = coverageData.total;
      const files = Object.keys(coverageData).filter(function (k) {
        return k !== 'total';
      });

      let fileRowsHTML = '';
      const self = this;
      files.forEach(function (filePath) {
        const file = coverageData[filePath];
        const fileName = path.basename(filePath);

        // Get actual uncovered lines from detailed coverage
        const uncoveredText = self.getUncoveredLines(detailedCoverage, filePath);

        fileRowsHTML +=
          '<tr class="file-row">' +
          '<td class="cell-file">&nbsp;' +
          fileName +
          '</td>' +
          '<td class="cell-pct ' +
          self.getCoverageClass(file.statements.pct) +
          '">' +
          self.formatPct(file.statements.pct) +
          '</td>' +
          '<td class="cell-pct ' +
          self.getCoverageClass(file.branches.pct) +
          '">' +
          self.formatPct(file.branches.pct) +
          '</td>' +
          '<td class="cell-pct ' +
          self.getCoverageClass(file.functions.pct) +
          '">' +
          self.formatPct(file.functions.pct) +
          '</td>' +
          '<td class="cell-pct ' +
          self.getCoverageClass(file.lines.pct) +
          '">' +
          self.formatPct(file.lines.pct) +
          '</td>' +
          '<td class="cell-uncovered">' +
          uncoveredText +
          '</td>' +
          '</tr>';
      });

      coverageTableHTML =
        '<div class="coverage-section">' +
        '<h2>📊 Code Coverage</h2>' +
        '<div class="coverage-table-container">' +
        '<table class="coverage-table">' +
        '<thead><tr>' +
        '<th class="th-file">File</th>' +
        '<th class="th-pct">% Stmts</th>' +
        '<th class="th-pct">% Branch</th>' +
        '<th class="th-pct">% Funcs</th>' +
        '<th class="th-pct">% Lines</th>' +
        '<th class="th-uncovered">Uncovered Line #s</th>' +
        '</tr></thead>' +
        '<tbody>' +
        '<tr class="total-row">' +
        '<td class="cell-file"><strong>All files</strong></td>' +
        '<td class="cell-pct ' +
        this.getCoverageClass(total.statements.pct) +
        '">' +
        this.formatPct(total.statements.pct) +
        '</td>' +
        '<td class="cell-pct ' +
        this.getCoverageClass(total.branches.pct) +
        '">' +
        this.formatPct(total.branches.pct) +
        '</td>' +
        '<td class="cell-pct ' +
        this.getCoverageClass(total.functions.pct) +
        '">' +
        this.formatPct(total.functions.pct) +
        '</td>' +
        '<td class="cell-pct ' +
        this.getCoverageClass(total.lines.pct) +
        '">' +
        this.formatPct(total.lines.pct) +
        '</td>' +
        '<td class="cell-uncovered"></td>' +
        '</tr>' +
        fileRowsHTML +
        '</tbody></table></div>' +
        '<div class="coverage-summary-box">' +
        '<div class="summary-header">=============================== Coverage summary ===============================</div>' +
        '<div class="summary-row"><span class="summary-label">Statements</span> : <span class="summary-value">' +
        this.formatPct(total.statements.pct) +
        ' ( ' +
        (total.statements.covered || 0) +
        '/' +
        (total.statements.total || 0) +
        ' )</span></div>' +
        '<div class="summary-row"><span class="summary-label">Branches</span>   : <span class="summary-value">' +
        this.formatPct(total.branches.pct) +
        ' ( ' +
        (total.branches.covered || 0) +
        '/' +
        (total.branches.total || 0) +
        ' )</span></div>' +
        '<div class="summary-row"><span class="summary-label">Functions</span>  : <span class="summary-value">' +
        this.formatPct(total.functions.pct) +
        ' ( ' +
        (total.functions.covered || 0) +
        '/' +
        (total.functions.total || 0) +
        ' )</span></div>' +
        '<div class="summary-row"><span class="summary-label">Lines</span>      : <span class="summary-value">' +
        this.formatPct(total.lines.pct) +
        ' ( ' +
        (total.lines.covered || 0) +
        '/' +
        (total.lines.total || 0) +
        ' )</span></div>' +
        '<div class="summary-footer">================================================================================</div>' +
        '</div></div>';
    }

    const failedSubtitle = numFailedTests > 0 ? '❌ Needs attention' : '🎉 All passed!';

    return (
      '<!DOCTYPE html>' +
      '<html lang="en">' +
      '<head>' +
      '  <meta charset="UTF-8">' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '  <title>Tazama Unit Test Report</title>' +
      '  <style>' +
      '    :root {' +
      '      --tazama-green: #3DBE8C;' +
      '      --tazama-dark-green: #2A8D68;' +
      '      --tazama-light-green: #E8F8F3;' +
      '      --success: #3DBE8C;' +
      '      --danger: #E74C3C;' +
      '      --warning: #F39C12;' +
      '      --text-dark: #1a1a1a;' +
      '      --text-muted: #666;' +
      '    }' +
      '    * { margin: 0; padding: 0; box-sizing: border-box; }' +
      '    body {' +
      '      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '      background: linear-gradient(135deg, #E8F8F3 0%, #d4f0e6 50%, #E8F8F3 100%);' +
      '      min-height: 100vh;' +
      '      padding: 30px;' +
      '      position: relative;' +
      '    }' +
      '    body::before {' +
      '      content: "";' +
      '      position: fixed;' +
      '      top: 0;' +
      '      left: 0;' +
      '      width: 100%;' +
      '      height: 100%;' +
      '      background-image: ' +
      '        radial-gradient(circle at 25% 25%, rgba(61, 190, 140, 0.08) 2%, transparent 2.5%),' +
      '        radial-gradient(circle at 75% 75%, rgba(61, 190, 140, 0.08) 2%, transparent 2.5%),' +
      '        linear-gradient(45deg, transparent 40%, rgba(61, 190, 140, 0.03) 40%, rgba(61, 190, 140, 0.03) 60%, transparent 60%),' +
      '        linear-gradient(-45deg, transparent 40%, rgba(61, 190, 140, 0.03) 40%, rgba(61, 190, 140, 0.03) 60%, transparent 60%);' +
      '      background-size: 80px 80px, 80px 80px, 120px 120px, 120px 120px;' +
      '      z-index: -1;' +
      '      pointer-events: none;' +
      '    }' +
      '    .container {' +
      '      max-width: 1200px;' +
      '      margin: 0 auto;' +
      '      background: rgba(255, 255, 255, 0.95);' +
      '      border-radius: 20px;' +
      '      box-shadow: 0 20px 60px rgba(61, 190, 140, 0.2), 0 0 0 1px rgba(61, 190, 140, 0.1);' +
      '      overflow: hidden;' +
      '      backdrop-filter: blur(10px);' +
      '    }' +
      '    .header {' +
      '      background: linear-gradient(135deg, var(--tazama-green) 0%, var(--tazama-dark-green) 100%);' +
      '      color: white;' +
      '      padding: 40px 50px;' +
      '      text-align: center;' +
      '      position: relative;' +
      '      overflow: hidden;' +
      '    }' +
      '    .header::before {' +
      '      content: "";' +
      '      position: absolute;' +
      '      top: 0; left: 0; right: 0; bottom: 0;' +
      '      background: radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%),' +
      '                  radial-gradient(circle at 80% 50%, rgba(255,255,255,0.1) 0%, transparent 50%);' +
      '      pointer-events: none;' +
      '    }' +
      '    .header-logo { font-size: 50px; margin-bottom: 10px; }' +
      '    .header h1 { font-size: 32px; font-weight: 600; margin-bottom: 8px; position: relative; }' +
      '    .header .subtitle { opacity: 0.9; font-size: 16px; position: relative; }' +
      '    .header .timestamp { margin-top: 15px; font-size: 14px; opacity: 0.8; position: relative; }' +
      '    .content { padding: 40px 50px; }' +
      '    .summary-cards {' +
      '      display: grid;' +
      '      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));' +
      '      gap: 20px;' +
      '      margin-bottom: 40px;' +
      '    }' +
      '    .card {' +
      '      background: linear-gradient(135deg, var(--tazama-light-green) 0%, white 100%);' +
      '      border: 2px solid var(--tazama-green);' +
      '      border-radius: 15px;' +
      '      padding: 25px;' +
      '      text-align: center;' +
      '      transition: all 0.3s ease;' +
      '      cursor: pointer;' +
      '    }' +
      '    .card:hover {' +
      '      transform: translateY(-8px);' +
      '      box-shadow: 0 15px 35px rgba(61, 190, 140, 0.25);' +
      '      border-color: var(--tazama-dark-green);' +
      '    }' +
      '    .card-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 10px; }' +
      '    .card-value { font-size: 42px; font-weight: 700; color: var(--tazama-green); }' +
      '    .card.passed .card-value { color: var(--success); }' +
      '    .card.failed .card-value { color: var(--danger); }' +
      '    .card-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 8px; }' +
      '    .coverage-section { margin-bottom: 40px; }' +
      '    .coverage-section h2 {' +
      '      color: var(--tazama-green);' +
      '      font-size: 24px;' +
      '      margin-bottom: 25px;' +
      '      padding-bottom: 15px;' +
      '      border-bottom: 3px solid var(--tazama-light-green);' +
      '    }' +
      '    .coverage-table-container {' +
      '      overflow-x: auto;' +
      '      margin-bottom: 25px;' +
      '      border-radius: 12px;' +
      '      border: 3px solid var(--tazama-green);' +
      '      box-shadow: 0 5px 20px rgba(61, 190, 140, 0.15);' +
      '    }' +
      '    .coverage-table {' +
      '      width: 100%;' +
      '      border-collapse: collapse;' +
      '      font-family: "Consolas", "Monaco", "Courier New", monospace;' +
      '      font-size: 14px;' +
      '    }' +
      '    .coverage-table thead {' +
      '      background: linear-gradient(135deg, var(--tazama-green) 0%, var(--tazama-dark-green) 100%);' +
      '    }' +
      '    .coverage-table th {' +
      '      color: white;' +
      '      padding: 15px 12px;' +
      '      text-align: center;' +
      '      font-weight: 600;' +
      '      border: 1px solid rgba(255,255,255,0.2);' +
      '    }' +
      '    .coverage-table .th-file { text-align: left; min-width: 150px; }' +
      '    .coverage-table .th-pct { min-width: 90px; }' +
      '    .coverage-table .th-uncovered { min-width: 150px; }' +
      '    .coverage-table td {' +
      '      padding: 12px;' +
      '      border: 1px solid #e0e0e0;' +
      '      text-align: center;' +
      '    }' +
      '    .coverage-table .cell-file { text-align: left; font-weight: 500; }' +
      '    .coverage-table .total-row { background: var(--tazama-light-green); font-weight: 600; }' +
      '    .coverage-table .total-row td { border-color: var(--tazama-green); }' +
      '    .coverage-table .file-row:hover { background: rgba(61, 190, 140, 0.08); }' +
      '    .coverage-table .cell-pct { font-weight: 600; }' +
      '    .coverage-table .cell-pct.high { color: var(--success); }' +
      '    .coverage-table .cell-pct.medium { color: var(--warning); }' +
      '    .coverage-table .cell-pct.low { color: var(--danger); }' +
      '    .coverage-table .cell-uncovered { color: var(--danger); font-weight: 600; }' +
      '    .coverage-summary-box {' +
      '      background: #1e1e1e;' +
      '      border-radius: 12px;' +
      '      padding: 20px 25px;' +
      '      font-family: "Consolas", "Monaco", "Courier New", monospace;' +
      '      font-size: 14px;' +
      '      color: #d4d4d4;' +
      '    }' +
      '    .coverage-summary-box .summary-header,' +
      '    .coverage-summary-box .summary-footer {' +
      '      color: var(--tazama-green);' +
      '      text-align: center;' +
      '      margin-bottom: 15px;' +
      '    }' +
      '    .coverage-summary-box .summary-footer { margin-bottom: 0; margin-top: 15px; }' +
      '    .coverage-summary-box .summary-row { padding: 8px 0; }' +
      '    .coverage-summary-box .summary-label { color: #9cdcfe; }' +
      '    .coverage-summary-box .summary-value { color: var(--success); }' +
      '    .test-section { margin-top: 40px; }' +
      '    .test-section h2 {' +
      '      color: var(--tazama-green);' +
      '      font-size: 24px;' +
      '      margin-bottom: 25px;' +
      '      padding-bottom: 15px;' +
      '      border-bottom: 3px solid var(--tazama-light-green);' +
      '    }' +
      '    .test-cards-grid {' +
      '      display: flex;' +
      '      flex-direction: column;' +
      '      gap: 12px;' +
      '    }' +
      '    .test-card {' +
      '      display: flex;' +
      '      align-items: center;' +
      '      gap: 15px;' +
      '      padding: 18px 20px;' +
      '      background: white;' +
      '      border: 2px solid #e8e8e8;' +
      '      border-radius: 12px;' +
      '      transition: all 0.3s ease;' +
      '    }' +
      '    .test-card:hover {' +
      '      transform: translateX(8px);' +
      '      border-color: var(--tazama-green);' +
      '      box-shadow: 0 8px 25px rgba(61, 190, 140, 0.15);' +
      '    }' +
      '    .test-card.passed { border-left: 5px solid var(--success); }' +
      '    .test-card.failed { border-left: 5px solid var(--danger); }' +
      '    .test-card .test-icon { font-size: 22px; }' +
      '    .test-card .test-name { flex: 1; font-weight: 500; color: var(--text-dark); }' +
      '    .test-card .test-duration {' +
      '      font-family: monospace;' +
      '      color: var(--text-muted);' +
      '      background: #f5f5f5;' +
      '      padding: 4px 10px;' +
      '      border-radius: 6px;' +
      '      font-size: 13px;' +
      '    }' +
      '    .test-summary-box {' +
      '      margin-top: 25px;' +
      '      background: #1e1e1e;' +
      '      color: #d4d4d4;' +
      '      padding: 20px 25px;' +
      '      border-radius: 12px;' +
      '      font-family: "Consolas", "Monaco", "Courier New", monospace;' +
      '      font-size: 14px;' +
      '      line-height: 1.8;' +
      '    }' +
      '    .test-summary-box .line-green { color: var(--success); }' +
      '    .test-summary-box .line-yellow { color: #e5c07b; }' +
      '    .footer {' +
      '      background: var(--tazama-light-green);' +
      '      padding: 25px;' +
      '      text-align: center;' +
      '      color: var(--text-muted);' +
      '      font-size: 14px;' +
      '    }' +
      '    .footer strong { color: var(--tazama-green); }' +
      '  </style>' +
      '</head>' +
      '<body>' +
      '  <div class="container">' +
      '    <div class="header">' +
      '      <h1>Tazama Unit Test Report</h1>' +
      '      <p class="subtitle">Unit Test Execution Report</p>' +
      '      <p class="timestamp">Generated: ' +
      timestamp +
      '</p>' +
      '    </div>' +
      '    <div class="content">' +
      '      <div class="summary-cards">' +
      '        <div class="card">' +
      '          <div class="card-title">Total Tests</div>' +
      '          <div class="card-value">' +
      numTotalTests +
      '</div>' +
      '          <div class="card-subtitle">Test cases executed</div>' +
      '        </div>' +
      '        <div class="card passed">' +
      '          <div class="card-title">Passed</div>' +
      '          <div class="card-value">' +
      numPassedTests +
      '</div>' +
      '          <div class="card-subtitle">✅ Successful</div>' +
      '        </div>' +
      '        <div class="card failed">' +
      '          <div class="card-title">Failed</div>' +
      '          <div class="card-value">' +
      numFailedTests +
      '</div>' +
      '          <div class="card-subtitle">' +
      failedSubtitle +
      '</div>' +
      '        </div>' +
      '        <div class="card">' +
      '          <div class="card-title">Duration</div>' +
      '          <div class="card-value">' +
      duration +
      '<span style="font-size: 18px;">s</span></div>' +
      '          <div class="card-subtitle">⏱️ Execution time</div>' +
      '        </div>' +
      '      </div>' +
      coverageTableHTML +
      '      <div class="test-section">' +
      '        <h2>📋 Test Execution Details</h2>' +
      '        <div class="test-cards-grid">' +
      testCardsHTML +
      '        </div>' +
      '        <div class="test-summary-box">' +
      '          <div><span class="line-green">Test Suites:</span> ' +
      (numPassedTestSuites || 1) +
      ' passed, ' +
      (numTotalTestSuites || 1) +
      ' total</div>' +
      '          <div><span class="line-green">Tests:</span>       ' +
      numPassedTests +
      ' passed, ' +
      numTotalTests +
      ' total</div>' +
      '          <div><span class="line-yellow">Snapshots:</span>   0 total</div>' +
      '          <div><span class="line-yellow">Time:</span>        ' +
      duration +
      ' s</div>' +
      '          <div>Ran all test suites.</div>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="footer">' +
      '      <strong>Tazama</strong> - Financial Crime Risk Management System<br>' +
      '      © 2026 Tazama. Powered by Paysys Labs.' +
      '    </div>' +
      '  </div>' +
      '</body>' +
      '</html>'
    );
  }
}

module.exports = TazamaHtmlReporter;
