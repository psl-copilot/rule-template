// SPDX-License-Identifier: Apache-2.0

const fs = require('fs');
const path = require('path');

// Load the TazamaHtmlReporter class
const TazamaHtmlReporter = require('./custom-reporter.js');

// Read the test results
const testResultsPath = path.join(process.cwd(), 'coverage', 'test-results.json');
let results = null;

if (fs.existsSync(testResultsPath)) {
  try {
    results = JSON.parse(fs.readFileSync(testResultsPath, 'utf8'));
    console.log('✅ Test results loaded');
  } catch (e) {
    console.log('❌ Could not read test results:', e.message);
    process.exit(1);
  }
} else {
  console.log('⚠️  No test results found. Run tests first.');
  process.exit(1);
}

// Read the coverage data
const coverageSummaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
const coverageFinalPath = path.join(process.cwd(), 'coverage', 'coverage-final.json');

let coverageData = null;
let detailedCoverage = null;

if (fs.existsSync(coverageSummaryPath)) {
  try {
    coverageData = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
    console.log('✅ Coverage summary loaded');
    console.log('Total coverage:', {
      statements: coverageData.total?.statements?.pct,
      branches: coverageData.total?.branches?.pct,
      functions: coverageData.total?.functions?.pct,
      lines: coverageData.total?.lines?.pct,
    });
  } catch (e) {
    console.log('❌ Could not read coverage summary:', e.message);
  }
} else {
  console.log('⚠️  No coverage data found');
}

if (fs.existsSync(coverageFinalPath)) {
  try {
    detailedCoverage = JSON.parse(fs.readFileSync(coverageFinalPath, 'utf8'));
  } catch (e) {
    console.log('Could not read detailed coverage');
  }
}

// Create reporter instance and generate HTML
const reporter = new TazamaHtmlReporter({}, { outputPath: 'reports/unit-tests/latest/index.html' });
const html = reporter.generateHTML(results, coverageData, detailedCoverage);

// Write the HTML file
const outputPath = 'reports/unit-tests/latest/index.html';
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(outputPath, html);
console.log('\n📊 Tazama Test Report generated: ' + outputPath);
