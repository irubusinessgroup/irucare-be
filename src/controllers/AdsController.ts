import {
  Body,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Tags,
  Request,
  Middlewares,
} from "tsoa";
import { AdsService } from "../services/AdsService";
import { CreateAdsDto, IResponse, TAds } from "../utils/interfaces/common";
import { Request as Req } from "express";
import upload from "../utils/cloudinary";
import { appendPhotoAttachments } from "../middlewares/company.middlewares";

@Tags("Ads")
@Route("/api/ads")
export class AdsController {
  @Get("/")
  public async getManyAds(): Promise<IResponse<TAds[]>> {
    return AdsService.getAllAds();
  }

  @Get("/{id}")
  public async getAds(@Path() id: string): Promise<IResponse<TAds | null>> {
    return AdsService.getAds(id);
  }

  @Post("/")
  @Middlewares(upload.any(), appendPhotoAttachments)
  public async createAds(
    @Body() adsData: CreateAdsDto,
    @Request() request: Req,
  ): Promise<IResponse<TAds>> {
    return new AdsService(request).createAds(adsData);
  }

  @Put("/{id}")
  public async updateAds(
    @Path() id: string,
    @Body() adsData: TAds,
  ): Promise<IResponse<TAds | null>> {
    return AdsService.updateAds(id, adsData);
  }

  @Delete("/{id}")
  public async deleteAds(@Path() id: string): Promise<IResponse<null>> {
    await AdsService.deleteAds(id);
    return {
      statusCode: 200,
      message: "Ads post deleted successfully",
    };
  }
}
