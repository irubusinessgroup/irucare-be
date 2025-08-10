import { Get, Path, Route, Tags } from "tsoa";
import { BarcodeService } from "../services/barcodeService";

@Tags("Barcode")
@Route("/api/barcode")
export class BarcodeController {
  @Get("/{barcode}")
  public async lookupItem(@Path() barcode: string) {
    return BarcodeService.lookupItemByBarcode(barcode);
  }
}
