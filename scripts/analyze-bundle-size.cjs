#!/usr/bin/env node

/**
 * Bundle Size Analysis Tool
 * 
 * Analyzes Hono bundle composition and identifies optimization opportunities.
 * Helps achieve the 5-10% bundle size reduction target (Goal #4).
 * 
 * Usage:
 *   node scripts/analyze-bundle-size.js
 *   node scripts/analyze-bundle-size.js --preset tiny
 *   node scripts/analyze-bundle-size.js --compare main..HEAD
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DIST_DIR = path.join(__dirname, '..', 'dist');
const SRC_DIR = path.join(__dirname, '..', 'src');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (e) {
    return null;
  }
}

function analyzeDist() {
  console.log(`${colors.bright}${colors.blue}=== Bundle Size Analysis ===${colors.reset}\n`);
  
  if (!fs.existsSync(DIST_DIR)) {
    console.log(`${colors.red}Error: dist/ directory not found. Run 'bun run build' first.${colors.reset}`);
    process.exit(1);
  }

  const results = {
    presets: {},
    core: {},
    middleware: {},
    helpers: {},
    total: 0,
  };

  // Analyze presets
  const presetDir = path.join(DIST_DIR, 'preset');
  if (fs.existsSync(presetDir)) {
    const presets = fs.readdirSync(presetDir).filter(f => f.endsWith('.js'));
    console.log(`${colors.bright}Presets:${colors.reset}`);
    presets.forEach(preset => {
      const size = getFileSize(path.join(presetDir, preset));
      if (size !== null) {
        results.presets[preset] = size;
        results.total += size;
        const sizeStr = formatBytes(size);
        const status = size > 12 * 1024 ? colors.red : colors.green;
        console.log(`  ${status}${preset.padEnd(20)}${sizeStr}${colors.reset}`);
      }
    });
    console.log();
  }

  // Analyze core exports
  const coreFiles = ['index.js', 'hono-base.js', 'context.js', 'request.js'];
  console.log(`${colors.bright}Core Modules:${colors.reset}`);
  coreFiles.forEach(file => {
    const size = getFileSize(path.join(DIST_DIR, file));
    if (size !== null) {
      results.core[file] = size;
      results.total += size;
      console.log(`  ${file.padEnd(20)}${formatBytes(size)}`);
    }
  });
  console.log();

  // Analyze middleware (if available)
  const middlewareDir = path.join(DIST_DIR, 'middleware');
  if (fs.existsSync(middlewareDir)) {
    const middleware = fs.readdirSync(middlewareDir);
    console.log(`${colors.bright}Middleware (Top 10):${colors.reset}`);
    const sizes = [];
    middleware.forEach(dir => {
      const indexPath = path.join(middlewareDir, dir, 'index.js');
      const size = getFileSize(indexPath);
      if (size !== null) {
        sizes.push({ name: dir, size });
        results.middleware[dir] = size;
      }
    });
    sizes.sort((a, b) => b.size - a.size).slice(0, 10).forEach(({ name, size }) => {
      console.log(`  ${name.padEnd(20)}${formatBytes(size)}`);
    });
    console.log();
  }

  console.log(`${colors.bright}${colors.cyan}Total analyzed: ${formatBytes(results.total)}${colors.reset}\n`);

  return results;
}

function analyzeSourceComplexity() {
  console.log(`${colors.bright}${colors.blue}=== Source Complexity Analysis ===${colors.reset}\n`);
  
  // Find largest source files (potential optimization targets)
  const result = execSync(
    `find ${SRC_DIR} -name "*.ts" -not -name "*.test.ts" -type f -exec wc -l {} + | sort -rn | head -15`,
    { encoding: 'utf-8' }
  );
  
  console.log(`${colors.bright}Largest Source Files (lines of code):${colors.reset}`);
  const lines = result.trim().split('\n');
  lines.forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const loc = parts[0];
      const file = parts[1];
      if (file && file !== 'total') {
        const shortPath = file.replace(SRC_DIR + '/', '');
        const locNum = parseInt(loc);
        const status = locNum > 500 ? colors.yellow : colors.reset;
        console.log(`  ${status}${loc.padStart(5)} lines  ${shortPath}${colors.reset}`);
      }
    }
  });
  console.log();
}

function analyzeTreeShaking() {
  console.log(`${colors.bright}${colors.blue}=== Tree-Shaking Analysis ===${colors.reset}\n`);
  
  console.log(`${colors.bright}Export Patterns:${colors.reset}`);
  
  // Check for barrel exports (can hurt tree-shaking)
  try {
    const indexContent = fs.readFileSync(path.join(SRC_DIR, 'index.ts'), 'utf-8');
    const exportStarLines = indexContent.split('\n').filter(line => line.includes('export *'));
    const exportNamedLines = indexContent.split('\n').filter(line => line.match(/export \{[^}]+\}/));
    
    console.log(`  Named exports: ${colors.green}${exportNamedLines.length}${colors.reset} (tree-shakeable)`);
    console.log(`  Star exports:  ${exportStarLines.length > 5 ? colors.yellow : colors.green}${exportStarLines.length}${colors.reset} (can reduce tree-shaking)`);
  } catch (e) {
    console.log(`  Could not analyze: ${e.message}`);
  }
  console.log();
}

function identifyOptimizations() {
  console.log(`${colors.bright}${colors.blue}=== Optimization Opportunities ===${colors.reset}\n`);
  
  const opportunities = [];
  
  // Check types.ts size (type-only file shouldn't be huge)
  const typesPath = path.join(SRC_DIR, 'types.ts');
  if (fs.existsSync(typesPath)) {
    const typesLines = fs.readFileSync(typesPath, 'utf-8').split('\n').length;
    if (typesLines > 2000) {
      opportunities.push({
        priority: 'Medium',
        area: 'Type Definitions',
        suggestion: `types.ts is ${typesLines} lines. Consider splitting into smaller type files for better IDE performance.`,
      });
    }
  }
  
  // Check for large middleware
  const middlewareDir = path.join(SRC_DIR, 'middleware');
  if (fs.existsSync(middlewareDir)) {
    const middleware = fs.readdirSync(middlewareDir);
    middleware.forEach(dir => {
      const indexPath = path.join(middlewareDir, dir, 'index.ts');
      if (fs.existsSync(indexPath)) {
        const lines = fs.readFileSync(indexPath, 'utf-8').split('\n').length;
        if (lines > 300) {
          opportunities.push({
            priority: 'Low',
            area: `Middleware: ${dir}`,
            suggestion: `${lines} lines. Review for potential simplification or code splitting.`,
          });
        }
      }
    });
  }
  
  // Check intrinsic-elements.ts (often large in JSX implementations)
  const intrinsicPath = path.join(SRC_DIR, 'jsx', 'intrinsic-elements.ts');
  if (fs.existsSync(intrinsicPath)) {
    const intrinsicLines = fs.readFileSync(intrinsicPath, 'utf-8').split('\n').length;
    if (intrinsicLines > 800) {
      opportunities.push({
        priority: 'Low',
        area: 'JSX Intrinsic Elements',
        suggestion: `${intrinsicLines} lines of type definitions. These don't affect runtime bundle but impact type-checking speed.`,
      });
    }
  }
  
  if (opportunities.length === 0) {
    console.log(`${colors.green}No obvious optimization opportunities identified.${colors.reset}`);
    console.log('Code appears well-structured for bundle size optimization.\n');
  } else {
    opportunities.forEach((opp, idx) => {
      const priorityColor = opp.priority === 'High' ? colors.red : 
                           opp.priority === 'Medium' ? colors.yellow : 
                           colors.blue;
      console.log(`${idx + 1}. ${priorityColor}[${opp.priority}]${colors.reset} ${colors.bright}${opp.area}${colors.reset}`);
      console.log(`   ${opp.suggestion}\n`);
    });
  }
}

function generateReport() {
  console.log(`${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}           Hono Bundle Size Analysis Report${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
  
  try {
    const results = analyzeDist();
    analyzeSourceComplexity();
    analyzeTreeShaking();
    identifyOptimizations();
    
    console.log(`${colors.bright}${colors.green}✓ Analysis complete${colors.reset}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Review large source files for optimization opportunities`);
    console.log(`  2. Use esbuild metafile for detailed bundle analysis`);
    console.log(`  3. Test tree-shaking with sample imports`);
    console.log(`  4. Monitor bundle size in CI (octocov)`);
    
  } catch (error) {
    console.error(`${colors.red}Error during analysis: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}Bundle Size Analysis Tool${colors.reset}

Usage:
  node scripts/analyze-bundle-size.js [options]

Options:
  --help, -h     Show this help message
  
This tool analyzes Hono's bundle size and identifies optimization opportunities.
It works best after running 'bun run build' to generate dist/ artifacts.

Examples:
  node scripts/analyze-bundle-size.js
  
For detailed bundle analysis, use esbuild metafile:
  bun run build (generates metafile)
  Upload meta.json to https://esbuild.github.io/analyze/
`);
    process.exit(0);
  }
  
  generateReport();
}

module.exports = { analyzeDist, analyzeSourceComplexity, identifyOptimizations };
