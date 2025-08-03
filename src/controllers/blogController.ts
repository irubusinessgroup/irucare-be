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
  Security,
} from "tsoa";
import { BlogService } from "../services/blogService";
import {
  CreateBlogDto,
  IResponse,
  TBlog,
  TLikes,
} from "../utils/interfaces/common";
import { Request as Req } from "express";
import upload from "../utils/cloudinary";
import { appendPhotoAttachments } from "../middlewares/company.middlewares";

@Tags("Blog")
@Route("/api/blog")
export class BlogController {
  @Get("/")
  public async getBlogs(): Promise<IResponse<TBlog[]>> {
    return BlogService.getAllBlog();
  }

  @Get("/top")
  public async getTopLiked(): Promise<IResponse<TBlog[]>> {
    return BlogService.getTopLiked();
  }

  @Get("/{id}")
  public async getBlog(@Path() id: string): Promise<IResponse<TBlog | null>> {
    return BlogService.getBlog(id);
  }

  @Post("/")
  @Middlewares(upload.any(), appendPhotoAttachments)
  public async createBlog(
    @Body() blogData: CreateBlogDto,
    @Request() request: Req,
  ): Promise<IResponse<TBlog>> {
    return new BlogService(request).createBlog(blogData);
  }

  @Put("/{id}")
  @Middlewares(upload.any(), appendPhotoAttachments)
  public async updateBlog(
    @Path() id: string,
    @Body() blogData: Partial<CreateBlogDto>,
  ): Promise<IResponse<TBlog | null>> {
    return BlogService.updateBlog(id, blogData);
  }

  @Put("/{id}/like")
  @Security("jwt")
  public async likeBlog(
    @Path() id: string,
    @Request() request: Req,
  ): Promise<IResponse<TLikes | null>> {
    return new BlogService(request).toggleLikeBlog(id);
  }

  @Delete("/{id}")
  public async deleteBlog(@Path() id: string): Promise<IResponse<null>> {
    await BlogService.deleteBlog(id);
    return {
      statusCode: 200,
      message: "Blog post deleted successfully",
    };
  }
}
