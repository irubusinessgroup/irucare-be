import { Get, Route, Tags } from "tsoa";
import { DropdownService } from "../services/dropdownService";
import {
  CategoryResponse,
  ConditionResponse,
  CurrencyResponse,
  IResponse,
  StorageLocationResponse,
  TemperatureRequirementResponse,
  UomResponse,
} from "../utils/interfaces/common";

@Tags("Dropdown Lists")
@Route("/api")
export class DropdownController {
  @Get("/categories")
  public async getCategories(): Promise<IResponse<CategoryResponse[]>> {
    return DropdownService.getCategories();
  }

  @Get("/uoms")
  public async getUnitsOfMeasure(): Promise<IResponse<UomResponse[]>> {
    return DropdownService.getUnitsOfMeasure();
  }

  @Get("/currencies")
  public async getCurrencies(): Promise<IResponse<CurrencyResponse[]>> {
    return DropdownService.getCurrencies();
  }

  @Get("/conditions")
  public async getConditions(): Promise<IResponse<ConditionResponse[]>> {
    return DropdownService.getConditions();
  }

  @Get("/temperature-requirements")
  public async getTemperatureRequirements(): Promise<
    IResponse<TemperatureRequirementResponse[]>
  > {
    return DropdownService.getTemperatureRequirements();
  }

  @Get("/storage-locations")
  public async getStorageLocations(): Promise<
    IResponse<StorageLocationResponse[]>
  > {
    return DropdownService.getStorageLocations();
  }
}
