import * as express from "express";
import * as bodyParser from "body-parser";

type COORDINATES = {
  x: number;
  y: number;
};
type PROTOCOLS =
  | "closest-enemies"
  | "furthest-enemies"
  | "assist-allies"
  | "avoid-crossfire"
  | "prioritize-mech"
  | "avoid-mech";
type ENEMIES_TYPE = "soldier" | "mech";

interface VisionModuleScanData {
  coordinates: COORDINATES;
  enemies: { type: ENEMIES_TYPE; number: number };
  allies?: number;
}
interface RadarModuleRequestData {
  protocols: Array<PROTOCOLS>;
  scan: Array<VisionModuleScanData>;
}

// calculate origin distance from xy
function d(x: number, y: number): number {
  return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
}

class RadarModuleService {
  processVision(
    res: express.Response,
    data: RadarModuleRequestData
  ): express.Response<COORDINATES> {
    const { protocols, scan } = data;

    let _scan: VisionModuleScanData[] = scan;
    let attackCords: COORDINATES = { x: 0, y: 0 };

    // excludes
    if (protocols.includes("avoid-mech")) {
      const filteredScan = _scan.filter((s) => s.enemies.type !== "mech");
      _scan = filteredScan;
      attackCords = _scan[0].coordinates;
    }

    // start position
    if (
      protocols.includes("closest-enemies") ||
      protocols.includes("furthest-enemies")
    ) {
      const matchedProtocolo = protocols.find(
        (p) => p === "closest-enemies" || p === "furthest-enemies"
      )!;

      const scanCoordsWithEnemiesSortedByMatchedProtocolo = _scan.sort(
        (a, b) => {
          switch (matchedProtocolo) {
            case "closest-enemies":
              if (
                d(a.coordinates.x, a.coordinates.y) <
                d(b.coordinates.x, b.coordinates.y)
              ) {
                return -1;
              }

              if (
                d(a.coordinates.x, a.coordinates.y) >
                d(b.coordinates.x, b.coordinates.y)
              ) {
                return 1;
              }

            case "furthest-enemies":
              if (
                d(a.coordinates.x, a.coordinates.y) <
                d(b.coordinates.x, b.coordinates.y)
              ) {
                return 1;
              }

              if (
                d(a.coordinates.x, a.coordinates.y) >
                d(b.coordinates.x, b.coordinates.y)
              ) {
                return -1;
              }
          }

          return 0;
        }
      );

      // max attack range is 100m so we filter unachievable coords
      const scanCoordsFilteredByMaxAttackRangeDistance = scanCoordsWithEnemiesSortedByMatchedProtocolo.filter(
        (s) => d(s.coordinates.x, s.coordinates.y) <= 100
      );

      attackCords = scanCoordsFilteredByMaxAttackRangeDistance[0].coordinates;
    }

    // checks
    if (
      protocols.includes("assist-allies") ||
      protocols.includes("avoid-crossfire")
    ) {
      const matchedProtocolo = protocols.find(
        (p) => p === "assist-allies" || p === "avoid-crossfire"
      )!;

      switch (matchedProtocolo) {
        case "assist-allies":
          _scan.sort((a, b) => {
            if (!a.allies) {
              return 1;
            }
            if (!b.allies) {
              return -1;
            }

            if (a.allies < b.allies) {
              return 1;
            }
            if (a.allies > b.allies) {
              return -1;
            }
          });
          break;
        case "avoid-crossfire":
          _scan = _scan.filter((s) => s.allies === undefined);
          break;
      }

      attackCords = _scan[0].coordinates;
    }

    // priority targets
    if (protocols.includes("prioritize-mech")) {
      const matchedProtocolo = protocols.find((p) => p === "prioritize-mech")!;

      let matchedPriorityAttackCoords: COORDINATES | undefined;
      switch (matchedProtocolo) {
        case "prioritize-mech":
          matchedPriorityAttackCoords = _scan.find(
            (s) => s.enemies.type === "mech"
          )?.coordinates;
          break;
      }

      attackCords = matchedPriorityAttackCoords || _scan[0].coordinates;
    }

    return res.send({ x: attackCords.x, y: attackCords.y });
  }
}

const radarService = new RadarModuleService();
const controllers = {
  radar: (req: express.Request, res: express.Response) =>
    radarService.processVision(res, req.body),
};

const app = express();
app.use(bodyParser.json());
app.post("/radar", controllers.radar);
app.listen(8888);
