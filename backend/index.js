// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import fs from "fs";
import { create as createIpfsClient } from "ipfs-http-client";

const app = express();
const PORT = 4000;

// Cho phép React FE gọi cross-domain
app.use(cors());
app.use(bodyParser.json());

// Multer để upload ảnh tạm vào thư mục /uploads
const upload = multer({ dest: "uploads/" });

// Kết nối tới IPFS local daemon
const ipfs = createIpfsClient({
  url: "http://127.0.0.1:5001/api/v0",
});

/* ----------------------------------------------------
 * 1️⃣ POST /api/events/uploadImage
 * Nhận file ảnh -> upload lên IPFS -> trả về CID
 * ---------------------------------------------------- */
app.post("/api/events/uploadImage", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Đọc file buffer
    const fileBuffer = fs.readFileSync(req.file.path);

    // Upload lên IPFS
    const result = await ipfs.add(fileBuffer, { pin: true });
    const cid = result.cid.toString();
    const imageURI = `ipfs://${cid}`;

    // Xoá file tạm
    fs.unlinkSync(req.file.path);

    console.log("Uploaded image CID:", cid);

    return res.json({
      ok: true,
      cid,
      imageURI,
      gatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
    });
  } catch (err) {
    console.error("Error uploading image:", err);
    return res.status(500).json({
      error: "Failed to upload image",
      detail: String(err),
    });
  }
});

/* ----------------------------------------------------
 * 2️⃣ POST /api/events/metadata
 * Nhận metadata JSON -> upload lên IPFS -> trả eventURI
 * FE sẽ gửi thêm field "image" nếu tồn tại
 * ---------------------------------------------------- */
app.post("/api/events/metadata", async (req, res) => {
  try {
    const {
      name,
      description,
      location,
      startTime,
      endTime,
      priceEth,
      maxSupply,
      maxTicketsPerAddress,
      image, // <-- new field
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Missing field: name" });
    }

    // Metadata chuẩn NFT
    const metadata = {
      name,
      description,
      image: image || null, // ipfs://..., nếu FE upload ảnh
      location,
      startTime,
      endTime,
      attributes: [
        { trait_type: "location", value: location },
        { trait_type: "price_eth", value: priceEth },
        { trait_type: "max_supply", value: maxSupply },
        {
          trait_type: "max_tickets_per_address",
          value: maxTicketsPerAddress,
        },
      ],
    };

    const buffer = Buffer.from(JSON.stringify(metadata, null, 2));

    // Upload metadata lên IPFS
    const result = await ipfs.add(buffer, { pin: true });

    const cid = result.cid.toString();
    const eventURI = `ipfs://${cid}`;

    console.log("Uploaded metadata CID:", cid);

    res.json({
      ok: true,
      cid,
      eventURI,
      metadata,
      gatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
    });
  } catch (err) {
    console.error("Error uploading metadata:", err);
    res.status(500).json({
      error: "Failed to upload metadata to IPFS",
      detail: String(err),
    });
  }
});

/* ----------------------------------------------------
 * Server start
 * ---------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
