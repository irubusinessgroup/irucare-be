import { Body, Delete, Get, Path, Post, Put, Route, Tags } from "tsoa";
import {
  CreateDeliveryDto,
  IResponse,
  TDelivery,
  UpdateDeliveryDto,
} from "../utils/interfaces/common";
import { DeliveryService } from "../services/DeliveryService";

@Tags("Delivery")
@Route("/api/delivery")
export class DeliveryController {
  @Get("/")
  public async getAllDeliveries(): Promise<IResponse<TDelivery[]>> {
    return DeliveryService.getAllDeliveries();
  }

  @Post("/")
  public async createDelivery(
    @Body() deliveryData: CreateDeliveryDto,
  ): Promise<IResponse<TDelivery>> {
    return DeliveryService.createDelivery(deliveryData);
  }

  @Put("/{id}")
  public async updateDelivery(
    @Path() id: string,
    @Body() deliveryData: Partial<UpdateDeliveryDto>,
  ): Promise<IResponse<TDelivery>> {
    return DeliveryService.updateDelivery(id, deliveryData);
  }

  @Delete("/{id}")
  public async deleteDelivery(@Path() id: string): Promise<IResponse<null>> {
    return DeliveryService.deleteDelivery(id);
  }

  @Get("/{id}")
  public async getDelivery(@Path() id: string): Promise<IResponse<TDelivery>> {
    return DeliveryService.getDelivery(id);
  }
}
