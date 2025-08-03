/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Body,
  Get,
  Middlewares,
  Post,
  Put,
  Route,
  Security,
  Tags,
  Path,
  Delete,
  Request,
} from "tsoa";
import { UserService } from "../services/userService";
import type {
  ILoginUser,
  IPaged,
  ISignUpUser,
  IUserResponse,
  CreateUserDto,
} from "../utils/interfaces/common";
import { loggerMiddleware } from "../utils/loggers/loggingMiddleware";
import { Request as ExpressRequest } from "express";
import { appendPhoto } from "../middlewares/company.middlewares";
import upload from "../utils/cloudinary";

@Tags("Authentication")
@Route("/api/auth")
export class UserController {
  @Get("/users")
  @Middlewares(loggerMiddleware)
  public getUser(
    @Request() req: ExpressRequest,
  ): Promise<IPaged<IUserResponse[]>> {
    const { searchq, limit, page } = req.query;
    const currentPage = page ? parseInt(page as string) : undefined;
    return UserService.getUsers(
      searchq as string | undefined,
      limit ? parseInt(limit as string) : undefined,
      currentPage,
    );
  }

  //delete user
  @Delete("/delete/{id}")
  @Security("jwt")
  @Middlewares(loggerMiddleware)
  public deleteUser(@Path() id: string) {
    return UserService.deleteUser(id);
  }

  @Put("/update-password")
  @Security("jwt")
  public async updatePassword(
    @Request() req: ExpressRequest,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = body;
    return UserService.updatePassword(userId, currentPassword, newPassword);
  }

  @Post("/request-password-reset")
  public async requestPasswordReset(@Body() body: { email: string }) {
    const { email } = body;
    return UserService.requestPasswordReset(email);
  }

  @Post("/reset-password")
  public async resetPassword(
    @Body() body: { email: string; otp: string; newPassword: string },
  ) {
    const { email, otp, newPassword } = body;
    return UserService.resetPassword(email, otp, newPassword);
  }

  @Post("signin")
  public loginUser(@Body() user: ILoginUser) {
    return UserService.loginUser(user);
  }

  //user signup
  @Post("/signup")
  @Middlewares(upload.any(), appendPhoto)
  public async signup(@Body() user: ISignUpUser) {
    return UserService.signUpUser(user);
  }

  @Post("/create")
  @Middlewares(upload.any(), appendPhoto)
  public async createUser(@Body() user: CreateUserDto) {
    return UserService.createUser(user);
  }

  @Put("/update/{id}")
  @Middlewares(upload.any(), appendPhoto)
  @Security("jwt")
  public async updateUser(@Path() id: string, @Body() user: CreateUserDto) {
    return UserService.updateUser(id, user);
  }

  @Get("/me")
  @Security("jwt")
  @Middlewares(loggerMiddleware)
  public getMe(@Request() req: ExpressRequest) {
    return UserService.getMe(req);
  }
}
