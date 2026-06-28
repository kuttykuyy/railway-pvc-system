import hmac
import io
import os

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from markitdown import MarkItDown, StreamInfo


MAX_PDF_SIZE = 25 * 1024 * 1024
MIN_MARKDOWN_LENGTH = 100

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.post("/")
@app.post("/api/pdf-to-markdown")
async def convert_pdf_to_markdown(
    file: UploadFile = File(...),
    x_markitdown_secret: str | None = Header(default=None),
):
    expected_secret = os.environ.get("MARKITDOWN_INTERNAL_SECRET", "")
    if not expected_secret:
        raise HTTPException(status_code=503, detail="MarkItDown service is not configured")
    if not x_markitdown_secret or not hmac.compare_digest(
        x_markitdown_secret, expected_secret
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read(MAX_PDF_SIZE + 1)
    if len(pdf_bytes) > MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds the 25 MB limit")
    if not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file")

    try:
        converter = MarkItDown(enable_plugins=False)
        result = converter.convert_stream(
            io.BytesIO(pdf_bytes),
            stream_info=StreamInfo(
                mimetype="application/pdf",
                extension=".pdf",
                filename=os.path.basename(file.filename or "bill.pdf"),
            ),
        )
        markdown = result.markdown.strip()
    except Exception as error:
        raise HTTPException(
            status_code=422, detail=f"MarkItDown conversion failed: {error}"
        ) from error

    if len(markdown) < MIN_MARKDOWN_LENGTH:
        raise HTTPException(
            status_code=422,
            detail="MarkItDown found no usable text in this PDF",
        )

    return {
        "markdown": markdown,
        "characterCount": len(markdown),
        "converter": "microsoft-markitdown",
    }
