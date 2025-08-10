import { prisma } from "../utils/client";
import {
  CategoryResponse,
  UomResponse,
  CurrencyResponse,
  ConditionResponse,
  TemperatureRequirementResponse,
  StorageLocationResponse,
  IResponse,
} from "../utils/interfaces/common";

export class DropdownService {
  static async getCategories(): Promise<IResponse<CategoryResponse[]>> {
    const categories = await prisma.itemCategories.findMany({
      orderBy: { category_name: "asc" },
    });

    const result = categories.map((category) => ({
      id: category.id,
      category_name: category.category_name,
      description: category.description,
    }));

    return {
      statusCode: 200,
      message: "Categories retrieved successfully",
      data: result,
    };
  }

  static async getUnitsOfMeasure(): Promise<IResponse<UomResponse[]>> {
    const uoms = await prisma.unitsOfMeasure.findMany({
      orderBy: { uom_name: "asc" },
    });

    const result = uoms.map((uom) => ({
      id: uom.id,
      uom_name: uom.uom_name,
      abbreviation: uom.abbreviation,
    }));

    return {
      statusCode: 200,
      message: "Units of measure retrieved successfully",
      data: result,
    };
  }

  static async getCurrencies(): Promise<IResponse<CurrencyResponse[]>> {
    const currencies = await prisma.currencies.findMany({
      orderBy: { currency_code: "asc" },
    });

    const result = currencies.map((currency) => ({
      id: currency.id,
      currency_code: currency.currency_code,
    }));

    return {
      statusCode: 200,
      message: "Currencies retrieved successfully",
      data: result,
    };
  }

  static async getConditions(): Promise<IResponse<ConditionResponse[]>> {
    const conditions = await prisma.conditionTypes.findMany({
      orderBy: { condition_name: "asc" },
    });

    const result = conditions.map((condition) => ({
      id: condition.id,
      condition_name: condition.condition_name,
      description: condition.description,
    }));

    return {
      statusCode: 200,
      message: "Condition types retrieved successfully",
      data: result,
    };
  }

  static async getTemperatureRequirements(): Promise<
    IResponse<TemperatureRequirementResponse[]>
  > {
    const tempReqs = await prisma.temperatureRequirements.findMany({
      orderBy: { temp_req_name: "asc" },
    });

    const result = tempReqs.map((temp) => ({
      id: temp.id,
      temp_req_name: temp.temp_req_name,
      min_temp_celsius: temp.min_temp_celsius
        ? parseFloat(temp.min_temp_celsius.toString())
        : undefined,
      max_temp_celsius: temp.max_temp_celsius
        ? parseFloat(temp.max_temp_celsius.toString())
        : undefined,
    }));

    return {
      statusCode: 200,
      message: "Temperature requirements retrieved successfully",
      data: result,
    };
  }

  static async getStorageLocations(): Promise<
    IResponse<StorageLocationResponse[]>
  > {
    const locations = await prisma.storageLocations.findMany({
      orderBy: { location_name: "asc" },
    });

    const result = locations.map((location) => ({
      id: location.id,
      location_name: location.location_name,
      location_type: location.location_type,
      description: location.description,
    }));

    return {
      statusCode: 200,
      message: "Storage locations retrieved successfully",
      data: result,
    };
  }
}
