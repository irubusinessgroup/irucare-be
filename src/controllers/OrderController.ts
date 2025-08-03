import { Body, Delete, Get, Path, Post, Put, Route, Tags } from "tsoa";
import { CreateOrderDto, IResponse, TOrder } from "../utils/interfaces/common";
import { OrderService } from "../services/OrderService";

@Tags("Order")
@Route("/api/order")
export class OrderController {
  @Get("/")
  public async getAllOrders(): Promise<IResponse<TOrder[]>> {
    return OrderService.getAllOrders();
  }

  @Post("/")
  public async createOrder(
    @Body() orderData: CreateOrderDto,
  ): Promise<IResponse<TOrder>> {
    return OrderService.createOrder(orderData);
  }

  @Put("/{id}")
  public async updateOrder(
    @Path() id: string,
    @Body() orderData: Partial<CreateOrderDto>,
  ): Promise<IResponse<TOrder>> {
    return OrderService.updateOrder(id, orderData);
  }

  @Delete("/{id}")
  public async deleteOrder(@Path() id: string): Promise<IResponse<null>> {
    return OrderService.deleteOrder(id);
  }

  @Get("/{id}")
  public async getOrder(@Path() id: string): Promise<IResponse<TOrder>> {
    return OrderService.getOrder(id);
  }
}
