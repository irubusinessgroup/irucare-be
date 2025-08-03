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
import { TestimonyService } from "../services/testimonyService";
import {
  CreateTestimonyDto,
  IResponse,
  TTestimony,
} from "../utils/interfaces/common";
import { Request as Req } from "express";
import upload from "../utils/cloudinary";
import { appendPhoto } from "../middlewares/company.middlewares";

@Tags("Testimony")
@Route("/api/testimony")
export class TestimonyController {
  @Get("/")
  public async getContacts(): Promise<IResponse<TTestimony[]>> {
    return TestimonyService.getAllTestimony();
  }

  @Get("/{id}")
  public async getContact(
    @Path() id: string,
  ): Promise<IResponse<TTestimony | null>> {
    return TestimonyService.getTestimony(id);
  }

  @Post("/property")
  @Middlewares(upload.any(), appendPhoto)
  public async createPropertyTestimony(
    @Body() testimonyData: CreateTestimonyDto,
    @Request() request: Req,
  ): Promise<IResponse<TTestimony>> {
    return new TestimonyService(request).createPropertyTestimony(testimonyData);
  }

  @Post("/agent")
  @Middlewares(upload.any(), appendPhoto)
  public async createAgentTestimony(
    @Body() testimonyData: CreateTestimonyDto,
    @Request() request: Req,
  ): Promise<IResponse<TTestimony>> {
    return new TestimonyService(request).createAgentTestimony(testimonyData);
  }

  @Put("/{id}")
  @Middlewares(upload.any(), appendPhoto)
  public async updateContact(
    @Path() id: string,
    @Body() testimonyData: CreateTestimonyDto,
  ): Promise<IResponse<TTestimony | null>> {
    return TestimonyService.updateTestimony(id, testimonyData);
  }

  @Delete("/{id}")
  public async deleteContact(@Path() id: string): Promise<IResponse<null>> {
    await TestimonyService.deleteTestimony(id);
    return {
      statusCode: 200,
      message: "Contacts post deleted successfully",
    };
  }
}
