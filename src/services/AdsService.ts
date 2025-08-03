import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import { CreateAdsDto, IResponse, TAds } from "../utils/interfaces/common";
import AppError from "../utils/error";

export class AdsService extends BaseService {
  public async createAds(adsData: CreateAdsDto): Promise<IResponse<TAds>> {
    try {
      const ads = await prisma.ads.create({
        data: {
          title: adsData.title,
          location: adsData.location,
          description: adsData.description,
          thumbnail:
            typeof adsData.thumbnail === "string" ? adsData.thumbnail : "",
        },
      });
      return {
        statusCode: 201,
        message: "Ads created successfully",
        data: ads,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAds(adsId: string): Promise<IResponse<TAds>> {
    try {
      const ads = await prisma.ads.findUnique({
        where: {
          id: adsId,
        },
      });

      if (!ads) {
        throw new AppError("Ads post not found", 404);
      }
      return {
        statusCode: 200,
        message: "Ads post fetched successfully",
        data: ads,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAllAds(): Promise<IResponse<TAds[]>> {
    try {
      const ads = await prisma.ads.findMany();

      return {
        statusCode: 200,
        message: "ads fetched successfully",
        data: ads,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateAds(
    adsId: string,
    adsData: Partial<CreateAdsDto>,
  ): Promise<IResponse<TAds>> {
    try {
      const ads = await prisma.ads.update({
        where: { id: adsId },
        data: {
          ...adsData,
          thumbnail:
            typeof adsData.thumbnail === "string"
              ? adsData.thumbnail
              : undefined,
        },
      });
      return {
        statusCode: 200,
        message: "Ads post updated successfully",
        data: ads,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteAds(adsId: string): Promise<IResponse<null>> {
    try {
      await prisma.ads.delete({ where: { id: adsId } });
      return {
        statusCode: 200,
        message: "ads post deleted successfully",
        data: null,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
