#! /usr/bin/env node
import path from "path";
import fs from "fs";
import https from "https";
import CliTable from "cli-table";
import colors from "colors/safe";
import { differenceInMilliseconds, formatTimeSince } from "./time";

const MS_IN_A_DAY = 1000 * 60 * 60 * 24;
const DITCHED_DAYS = 90;
const REGISTRY_URL = "https://registry.npmjs.org";

const showAllPackages =
  process.argv.includes("--all") || process.argv.includes("-a");

function getJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (!response.statusCode || response.statusCode >= 400) {
        return reject(
          new Error(
            `Could not fetch URL ${url} package info. Status code ${response.statusCode}`
          )
        );
      }
      const body: any[] = [];
      response.on("data", (chunk) => body.push(chunk));
      response.on("end", () => resolve(JSON.parse(body.join(""))));
      request.on("error", (err) => reject(err));
    });
  });
}

type PackageInfo = {
  name: string;
  modifiedDate?: Date;
};

function isDitched({ modifiedDate }: PackageInfo): boolean {
  if (!modifiedDate) return false;
  const ageDays =
    differenceInMilliseconds(new Date(), modifiedDate) / MS_IN_A_DAY;
  return ageDays > DITCHED_DAYS;
}

function printInfoTable(dataForPackages: PackageInfo[]): void {
  const table = new CliTable({
    head: [
      colors.gray("Package"),
      colors.gray("Last Modified"),
      colors.gray("Ditched?"),
    ],
    colWidths: [30, 40, 15],
  });

  dataForPackages
    .filter((data) => showAllPackages || isDitched(data))
    .sort((a, b) => {
      if (!a.modifiedDate) return -1;
      if (!b.modifiedDate) return 1;
      return differenceInMilliseconds(b.modifiedDate, a.modifiedDate);
    })
    .forEach((packageInfo) => {
      const { name, modifiedDate } = packageInfo;

      const formattedTime = modifiedDate
        ? formatTimeSince(modifiedDate)
        : "No package info found.";

      let ditchedInfo = colors.red("?");
      if (modifiedDate) {
        ditchedInfo = isDitched(packageInfo)
          ? colors.red("Yes")
          : colors.green("No");
      }

      table.push([name, formattedTime, ditchedInfo]);
    });

  console.log(table.toString());
}

async function getInfoForPackage(packageName: string): Promise<PackageInfo> {
  try {
    const regUrl = REGISTRY_URL + "/" + packageName;
    const response = await getJSON<{ time: { modified: string } }>(regUrl);
    const modifiedDate = new Date(response.time.modified);

    return {
      name: packageName,
      modifiedDate,
    };
  } catch (error) {
    return {
      name: packageName,
    };
  }
}

async function main() {
  const packageJsonPath = path.join(process.cwd(), "package.json");

  console.log("Looking for package.json in " + packageJsonPath + ".");

  const packageJsonStr = fs.readFileSync(packageJsonPath, {
    encoding: "utf8",
  });

  const { dependencies = {}, devDependencies = {} } =
    JSON.parse(packageJsonStr);

  const packages = [
    ...Object.keys(dependencies),
    ...Object.keys(devDependencies),
  ];

  console.log("Found " + packages.length + " packages.");
  const dataForPackages = await Promise.all(packages.map(getInfoForPackage));
  printInfoTable(dataForPackages);

  if (dataForPackages.filter(isDitched).length > 0) {
    process.exit(1);
  }
}

main();