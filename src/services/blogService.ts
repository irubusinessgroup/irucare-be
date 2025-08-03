import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreateBlogDto,
  IResponse,
  TBlog,
  TLikes,
} from "../utils/interfaces/common";
import AppError from "../utils/error";

export class BlogService extends BaseService {
  public async createBlog(blogData: CreateBlogDto): Promise<IResponse<TBlog>> {
    try {
      const blog = await prisma.blog.create({
        data: {
          title: blogData.title,
          teaser: blogData.teaser,
          description: blogData.description,
          category: blogData.category,
          likes: blogData.likes ?? 0,
          views: blogData.views ?? 0,
          featured: blogData.featured ?? false,
          thumbnail:
            typeof blogData.thumbnail === "string" ? blogData.thumbnail : "",
        },
      });
      return {
        statusCode: 201,
        message: "blog created successfully",
        data: blog,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getBlog(blogId: string): Promise<IResponse<TBlog>> {
    try {
      const blog = await prisma.blog.findUnique({
        where: {
          id: blogId,
        },
      });

      if (!blog) {
        throw new AppError("blog post not found", 404);
      }

      // Increment views count
      const updatedBlog = await prisma.blog.update({
        where: { id: blogId },
        data: { views: blog.views + 1 },
      });

      return {
        statusCode: 200,
        message: "blog post fetched successfully",
        data: updatedBlog,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAllBlog(): Promise<IResponse<TBlog[]>> {
    try {
      const blog = await prisma.blog.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });

      return {
        statusCode: 200,
        message: "blog fetched successfully",
        data: blog,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getTopLiked(): Promise<IResponse<TBlog[]>> {
    try {
      const blog = await prisma.blog.findMany({
        orderBy: {
          likes: "desc",
        },
        take: 5,
      });

      return {
        statusCode: 200,
        message: "Top liked blogs fetched successfully",
        data: blog,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateBlog(
    blogId: string,
    blogData: Partial<CreateBlogDto>,
  ): Promise<IResponse<TBlog>> {
    try {
      const updatedBlog = await prisma.blog.update({
        where: { id: blogId },
        data: {
          ...blogData,
          thumbnail:
            typeof blogData.thumbnail === "string"
              ? blogData.thumbnail
              : undefined,
        },
      });
      return {
        statusCode: 200,
        message: "Blog post updated successfully",
        data: updatedBlog,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteBlog(blogId: string): Promise<IResponse<null>> {
    try {
      await prisma.blog.delete({ where: { id: blogId } });
      return {
        statusCode: 200,
        message: "blog post deleted successfully",
        data: null,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public async likeBlog(blogId: string): Promise<IResponse<TLikes>> {
    try {
      const userId = this.request.user!.id;
      const blog = await prisma.blog.findUnique({
        where: { id: blogId },
      });

      if (!blog) {
        throw new AppError("blog post not found", 404);
      }

      const updatedBlog = await prisma.likes.create({
        data: {
          blogId,
          userId,
        },
      });

      return {
        statusCode: 200,
        message: "Blog post liked successfully",
        data: updatedBlog,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public async toggleLikeBlog(blogId: string): Promise<IResponse<TLikes>> {
    try {
      const userId = this.request.user!.id;
      const blog = await prisma.blog.findUnique({
        where: { id: blogId },
      });

      if (!blog) {
        throw new AppError("blog post not found", 404);
      }

      const existingLike = await prisma.likes.findUnique({
        where: {
          blogId_userId: { blogId, userId },
        },
      });

      if (existingLike) {
        await prisma.likes.delete({
          where: {
            blogId_userId: { blogId, userId },
          },
        });

        const updatedBlog = await prisma.blog.update({
          where: { id: blogId },
          data: { likes: blog.likes - 1 },
        });

        return {
          statusCode: 200,
          message: "Blog post unliked successfully",
          data: updatedBlog,
        };
      } else {
        await prisma.likes.create({
          data: {
            blogId,
            userId,
          },
        });

        const updatedBlog = await prisma.blog.update({
          where: { id: blogId },
          data: { likes: blog.likes + 1 },
        });

        return {
          statusCode: 200,
          message: "Blog post liked successfully",
          data: updatedBlog,
        };
      }
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
