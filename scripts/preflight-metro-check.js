#!/usr/bin/env node
/**
 * Preflight Metro Check
 * Detects problematic dependency patterns before EAS Build
 * Based on ChatGPT recommendations for Metro + npm + EAS Build fragility
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let errors = [];
let warnings = [];

// Helper to check if file exists
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

// Helper to read package.json
function readPackageJson(pkgPath) {
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

// 1. Check packages with prepare scripts that need dist files
function checkPrepareScripts() {
  console.log('🔍 Checking packages with prepare scripts...');
  const nodeModules = path.join(process.cwd(), 'node_modules');
  const issues = [];
  
  function checkPackage(dir, pkgName) {
    const pkgPath = path.join(dir, 'package.json');
    if (!fileExists(pkgPath)) return;
    
    const pkg = readPackageJson(pkgPath);
    if (!pkg) return;
    
    if (pkg.scripts && (pkg.scripts.prepare || pkg.scripts.postinstall || pkg.scripts.prepack)) {
      // Check if main points to dist/ and if file exists
      if (pkg.main && pkg.main.includes('dist')) {
        const distPath = path.join(dir, pkg.main);
        if (!fileExists(distPath)) {
          issues.push({
            package: pkgName,
            issue: `prepare script builds dist file but ${pkg.main} is missing`,
            severity: 'error',
            fix: `Add to postinstall script or ensure dist file exists`
          });
        }
      }
      
      // Check for common dist patterns
      const distDir = path.join(dir, 'dist');
      if (pkg.main && pkg.main.includes('dist') && !fileExists(distDir)) {
        issues.push({
          package: pkgName,
          issue: `prepare script required but dist/ directory missing`,
          severity: 'warning',
          fix: `Ensure postinstall script creates dist files`
        });
      }
    }
  }
  
  // Check direct dependencies
  const rootPkg = readPackageJson('package.json');
  if (rootPkg && rootPkg.dependencies) {
    Object.keys(rootPkg.dependencies).forEach(dep => {
      const depPath = path.join(nodeModules, dep);
      if (fileExists(depPath)) {
        checkPackage(depPath, dep);
      }
    });
  }
  
  if (issues.length > 0) {
    issues.forEach(issue => {
      if (issue.severity === 'error') {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    });
  } else {
    console.log('✅ No prepare script issues found');
  }
}

// 2. Check for packages with exports subpaths (Metro weak spot)
function checkExportsSubpaths() {
  console.log('🔍 Checking packages with exports subpaths...');
  const nodeModules = path.join(process.cwd(), 'node_modules');
  const knownOffenders = ['semver'];
  const issues = [];
  
  function checkPackage(dir, pkgName) {
    const pkgPath = path.join(dir, 'package.json');
    if (!fileExists(pkgPath)) return;
    
    const pkg = readPackageJson(pkgPath);
    if (!pkg) return;
    
    if (pkg.exports && typeof pkg.exports === 'object') {
      const subpaths = Object.keys(pkg.exports).filter(key => key.startsWith('./'));
      if (subpaths.length > 0) {
        // Check if we have a resolver for known offenders
        if (knownOffenders.includes(pkgName)) {
          // Check if it's in metro.config.js
          const metroConfig = path.join(process.cwd(), 'metro.config.js');
          if (fileExists(metroConfig)) {
            const metroContent = fs.readFileSync(metroConfig, 'utf8');
            if (!metroContent.includes(`${pkgName}/`)) {
              issues.push({
                package: pkgName,
                issue: `Has exports subpaths but no Metro resolver found`,
                severity: 'warning',
                fix: `Add Metro resolver for ${pkgName}/ subpaths`
              });
            }
          }
        }
      }
    }
  }
  
  const rootPkg = readPackageJson('package.json');
  if (rootPkg && rootPkg.dependencies) {
    Object.keys(rootPkg.dependencies).forEach(dep => {
      const depPath = path.join(nodeModules, dep);
      if (fileExists(depPath)) {
        checkPackage(depPath, dep);
      }
    });
  }
  
  if (issues.length > 0) {
    issues.forEach(issue => warnings.push(issue));
  } else {
    console.log('✅ No exports subpath issues found');
  }
}

// 3. Check for peer dependency mismatches
function checkPeerDependencies() {
  console.log('🔍 Checking peer dependency mismatches...');
  
  try {
    // Run npm ls to check for peer dependency issues
    const output = execSync('npm ls --depth=0 2>&1', { encoding: 'utf8', stdio: 'pipe' });
    
    // Check for common peer dependency errors
    if (output.includes('UNMET PEER DEPENDENCY') || output.includes('invalid')) {
      const lines = output.split('\n').filter(line => 
        line.includes('UNMET PEER') || line.includes('invalid')
      );
      
      lines.forEach(line => {
        warnings.push({
          package: 'peer-dependency',
          issue: line.trim(),
          severity: 'warning',
          fix: 'Check and install missing peer dependencies'
        });
      });
    } else {
      console.log('✅ No peer dependency mismatches found');
    }
  } catch (e) {
    // npm ls exits with non-zero on peer issues, which is expected
    const output = e.stdout || e.stderr || '';
    if (output.includes('UNMET PEER') || output.includes('invalid')) {
      warnings.push({
        package: 'peer-dependency',
        issue: 'Some peer dependencies may be mismatched',
        severity: 'warning',
        fix: 'Run: npm ls --depth=0 to see details'
      });
    }
  }
}

// 4. Check for critical missing dist files
function checkCriticalDistFiles() {
  console.log('🔍 Checking critical dist files...');
  const nodeModules = path.join(process.cwd(), 'node_modules');
  const criticalChecks = [
    { pkg: 'whatwg-fetch', file: 'dist/fetch.umd.js', fallback: 'fetch.js' },
    { pkg: 'abort-controller', file: 'dist/abort-controller.js' },
  ];
  
  criticalChecks.forEach(check => {
    const pkgPath = path.join(nodeModules, check.pkg);
    if (!fileExists(pkgPath)) {
      errors.push({
        package: check.pkg,
        issue: `Package not installed`,
        severity: 'error',
        fix: `npm install ${check.pkg}`
      });
      return;
    }
    
    const distFile = path.join(pkgPath, check.file);
    if (!fileExists(distFile)) {
      // Check for fallback
      if (check.fallback) {
        const fallbackFile = path.join(pkgPath, check.fallback);
        if (fileExists(fallbackFile)) {
          warnings.push({
            package: check.pkg,
            issue: `${check.file} missing, using fallback ${check.fallback}`,
            severity: 'warning',
            fix: 'Ensure postinstall script creates dist file'
          });
        } else {
          errors.push({
            package: check.pkg,
            issue: `${check.file} missing and no fallback found`,
            severity: 'error',
            fix: 'Run postinstall script or add to ensure-built-artifacts.js'
          });
        }
      } else {
        errors.push({
          package: check.pkg,
          issue: `${check.file} missing`,
          severity: 'error',
          fix: 'Run postinstall script or add to ensure-built-artifacts.js'
        });
      }
    }
  });
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All critical dist files present');
  }
}

// 5. Verify test:bundle script works
function checkBundleTest() {
  console.log('🔍 Checking if test:bundle script exists...');
  const rootPkg = readPackageJson('package.json');
  
  if (rootPkg && rootPkg.scripts && rootPkg.scripts['test:bundle']) {
    console.log('✅ test:bundle script found');
  } else {
    warnings.push({
      package: 'package.json',
      issue: 'test:bundle script not found',
      severity: 'warning',
      fix: 'Add "test:bundle": "npx expo export:embed --eager --platform android --dev false" to scripts'
    });
  }
}

// Main execution
console.log('🚀 Running Metro Preflight Check...\n');

checkPrepareScripts();
console.log('');
checkExportsSubpaths();
console.log('');
checkPeerDependencies();
console.log('');
checkCriticalDistFiles();
console.log('');
checkBundleTest();
console.log('');

// Report results
if (errors.length > 0) {
  console.log('❌ ERRORS FOUND:');
  errors.forEach((err, i) => {
    console.log(`\n${i + 1}. ${err.package}`);
    console.log(`   Issue: ${err.issue}`);
    console.log(`   Fix: ${err.fix}`);
  });
  console.log('\n⚠️  Build will likely fail. Fix errors before pushing to EAS Build.\n');
  process.exit(1);
}

if (warnings.length > 0) {
  console.log('⚠️  WARNINGS:');
  warnings.forEach((warn, i) => {
    console.log(`\n${i + 1}. ${warn.package}`);
    console.log(`   Issue: ${warn.issue}`);
    console.log(`   Fix: ${warn.fix}`);
  });
  console.log('\n⚠️  Review warnings - they may cause issues on EAS Build.\n');
  process.exit(0);
}

console.log('✅ All preflight checks passed! Ready for EAS Build.\n');
process.exit(0);


