import { Get, Route, Tags } from "tsoa";
import { StatisticService } from "../services/StatisticService";

@Tags("Statistic")
@Route("/api/statistic")
export class StatisticController {
  @Get("/count-by-month/{year}")
  public getSchoolsCountByMonth(year: number) {
    return StatisticService.getStatisticsByMonth(year);
  }
}
