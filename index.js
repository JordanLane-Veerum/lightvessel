import { writeFile } from "fs";
import puppeteer from "puppeteer";
import lighthouse, { desktopConfig } from "lighthouse";
import { pick } from "lodash-es";

const USERNAME = "";
const PASSWORD = "";

const ITERATIONS = 10;

// Login using puppeteer so that protected routes can be accessed
async function login(page, origin) {
  await page.goto(origin);
  await page.waitForSelector('input[data-cy="EmailInput"]');

  const emailInput = await page.$('input[data-cy="EmailInput"]');
  const passwordInput = await page.$('input[data-cy="PasswordInput"]');

  await emailInput.type(USERNAME);
  await passwordInput.type(PASSWORD);

  const signInButton = await page.$('button[data-cy="SignInButton"]');
  await signInButton.click();
}

function parsePerformanceResults(audits) {
  const relevantAudits = (({
    "first-contentful-paint": fcp,
    "largest-contentful-paint": lcp,
    "speed-index": si,
    "total-blocking-time": tbt,
    "max-potential-fid": mpf,
    "cumulative-layout-shift": cls,
  }) => ({ fcp, lcp, si, tbt, mpf, cls }))(audits);

  const parsedResults = pick(relevantAudits, [
    "fcp.numericValue",
    "fcp.numericUnit",
    "lcp.numericValue",
    "lcp.numericUnit",
    "si.numericValue",
    "si.numericUnit",
    "tbt.numericValue",
    "tbt.numericUnit",
    "mpf.numericValue",
    "mpf.numericUnit",
    "cls.numericValue",
    "cls.numericUnit",
  ]);

  return parsedResults;
}

function averagePerformanceResults(results) {
  const averagedResults = {};

  ["fcp", "lcp", "si", "tbt", "mpf", "cls"].forEach((metric) => {
    let sum = 0;
    let count = 0;

    const numericUnit = results[0][metric].numericUnit;

    results.forEach((result) => {
      const metricSample = result[metric];

      if (metricSample.scoreDisplayMode === "numeric") {
        sum += metricSample.numericValue;
        count += 1;
      }
    });

    const averageResult = {
      averageNumericValue: sum / count,
      numericUnit,
    };

    averagedResults[metric] = averageResult;
  });

  return averagedResults;
}

async function lighthouseTest(page, url) {
  const result = await lighthouse(
    url,
    { disableStorageReset: true },
    desktopConfig,
    page
  );

  return parsePerformanceResults(result.lhr.audits);
}

async function main() {
  if (!USERNAME || !PASSWORD) {
    console.log(
      "Error: please setup username and password before running the script."
    );
    console.log("More info can be found in the README");
    return;
  }

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({ width: 1080, height: 1024 });

  const loginResults = [];
  const workscopesResults = [];
  const viewerResults = [];

  process.stdout.write("Login page tests...\r");
  for (let i = 0; i < ITERATIONS; i++) {
    const result = await lighthouseTest(
      page,
      "https://digital-twin.veerum.com/login"
    );
    loginResults.push(result);
  }
  console.log("Login page tests... Completed");

  // Login to gain access to protected routes
  await login(page, "https://digital-twin.veerum.com/login");

  process.stdout.write("Workscopes page tests...\r");
  for (let i = 0; i < ITERATIONS; i++) {
    const result = await lighthouseTest(
      page,
      "https://digital-twin.veerum.com"
    );
    workscopesResults.push(result);
  }
  console.log("Workscopes page tests... Completed");

  process.stdout.write("Viewer page tests...\r");
  for (let i = 0; i < ITERATIONS; i++) {
    const result = await lighthouseTest(
      page,
      "https://digital-twin.veerum.com/workscopes/631b6641310c4751c59be759/viewer"
    );
    viewerResults.push(result);
  }
  console.log("Viewer page tests... Completed");

  const fullResults = {
    loginResults,
    workscopesResults,
    viewerResults,
  };

  writeFile("results.json", JSON.stringify(fullResults), function (err) {
    if (err) throw err;
    console.log("complete");
  });

  browser.close();
}

await main();
