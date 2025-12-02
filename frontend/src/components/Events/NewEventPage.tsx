// src/components/Events/NewEventPage.tsx
import { useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther } from "viem";
import factoryArtifact from "../../contracts/EventTicketFactory.json"; // đường dẫn tùy cấu trúc project
import "../css/Events/NewEventPage.css";
import "../../contracts/FactoryAddress.json";
import factoryAddressJson from "../../contracts/FactoryAddress.json";

const FACTORY_ADDRESS =
  ((factoryAddressJson as any)?.address ||
    (factoryAddressJson as any)?.FACTORY_ADDRESS ||
    (typeof factoryAddressJson === "string" ? factoryAddressJson : undefined) ||
    "0xYourFactoryAddressHere") as `0x${string}`;


interface FormState {
  name: string;
  symbol: string;
  location: string;
  description: string;
  ticketPriceEth: string;
  maxSupply: string;
  maxTicketsPerAddress: string;
  startTime: string; // datetime-local
  endTime: string;   // datetime-local
}

interface CreatedEventSummary extends FormState {
  txHash?: `0x${string}` | string;
}

// Helper: chuyển tên event thành slug
const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

// Helper: sinh tự động eventURI và baseTokenURI
const generateEventURI = (name: string) => {
  const slug = slugify(name || "event");
  const ts = Date.now();
  // Tuỳ backend của bạn, có thể đổi ipfs://... thành https://...
  return `ipfs://events/${slug}-${ts}.json`;
};

const generateBaseTokenURI = (name: string) => {
  const slug = slugify(name || "event");
  const ts = Date.now();
  return `ipfs://tokens/${slug}-${ts}/`;
};

const NewEventPage = () => {
  const { address: userAddress } = useAccount();

  const [form, setForm] = useState<FormState>({
    name: "",
    symbol: "",
    location: "",
    description: "",
    ticketPriceEth: "",
    maxSupply: "",
    maxTicketsPerAddress: "",
    startTime: "",
    endTime: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] = useState<CreatedEventSummary | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };


  const {
    writeContractAsync,
    data: txHash,
    isPending,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
      // nếu user chưa nhập symbol, tự sinh từ name
      ...(name === "name" && !prev.symbol
        ? { symbol: value.trim().slice(0, 4).toUpperCase() }
        : {}),
    }));
  };

  const toUnix = (value: string): number => {
    if (!value) return 0;
    const d = new Date(value);
    return Math.floor(d.getTime() / 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setSuccessMsg(null);

  if (!userAddress) {
    setError("Bạn cần kết nối ví trước khi tạo sự kiện.");
    return;
  }

  // ... (các validate như trước: name, price, time, v.v.)

  const startTs = toUnix(form.startTime);
  const endTs = toUnix(form.endTime);

  let ticketPriceWei;
  try {
    ticketPriceWei = parseEther(form.ticketPriceEth);
  } catch {
    setError("Giá vé không hợp lệ (hãy nhập số, ví dụ 0.01).");
    return;
  }

  const maxSupply = BigInt(form.maxSupply);
  const maxTicketsPerAddress = BigInt(form.maxTicketsPerAddress);

  let imageURI = null;

    // Upload ảnh nếu user đã chọn
  if (imageFile) {
    const imgForm = new FormData();
    imgForm.append("file", imageFile);

    const imgResp = await fetch("http://localhost:4000/api/events/uploadImage", {
      method: "POST",
      body: imgForm,
    });

    if (!imgResp.ok) {
      throw new Error("Lỗi upload ảnh");
    }

    const imgJson = await imgResp.json();
    imageURI = imgJson.imageURI;  // example: ipfs://images/event123.png
  }

  try {
    // 1️⃣ Gọi backend để upload metadata lên local IPFS
   const resp = await fetch("http://localhost:4000/api/events/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: form.name,
      description: form.description,
      location: form.location,
      startTime: startTs,
      endTime: endTs,
      priceEth: form.ticketPriceEth,
      maxSupply: form.maxSupply,
      maxTicketsPerAddress: form.maxTicketsPerAddress,
      image: imageURI,  // provide thumbnail here
    }),
  });


    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || "Backend upload error");
    }

    const { eventURI } = await resp.json();

    // 2️⃣ Gọi smart contract với eventURI vừa sinh
    await writeContractAsync({
      address: FACTORY_ADDRESS,
      abi: factoryArtifact.abi,
      functionName: "createEvent",
      args: [
        form.name,
        form.symbol || form.name.slice(0, 4).toUpperCase(),
        ticketPriceWei,
        maxSupply,
        eventURI,         // ipfs://... từ backend
        "",               // baseTokenURI (bạn có thể extend sau)
        maxTicketsPerAddress,
        BigInt(startTs),
        BigInt(endTs),
      ],
    });

    setSuccessMsg("Đã gửi giao dịch tạo sự kiện. Vui lòng chờ xác nhận...");
  } catch (err: any) {
    console.error(err);
    setError(
      err?.shortMessage ||
        err?.message ||
        "Lỗi khi gửi giao dịch tạo sự kiện."
    );
  }
};


  return (
    <div className="new-event-page">
      <div className="new-event-card">
        <h1 className="new-event-title">Tạo sự kiện mới</h1>
        <p className="new-event-subtitle">
          Nhập thông tin sự kiện và triển khai lên blockchain.
        </p>

        <form className="new-event-form" onSubmit={handleSubmit}>
          {/* Tên & Symbol */}
          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Tên sự kiện</label>
              <br />
              <input
                type="text"
                name="name"
                className="form-input"
                value={form.name}
                onChange={handleChange}
                placeholder="Ví dụ: Mintatix Concert 2025"
              />
            </div>

            <div className="form-field">
              <label className="form-label">
                Mã sự kiện (Symbol){" "}
                <span className="label-optional">(tự sinh nếu bỏ trống)</span>
              </label>
              <br />
              <input
                type="text"
                name="symbol"
                className="form-input"
                value={form.symbol}
                onChange={handleChange}
                placeholder="MINT"
              />
            </div>
          </div>

          {/* Thời gian */}
          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Thời gian bắt đầu bán vé</label>
              <br />
              <input
                type="datetime-local"
                name="startTime"
                className="form-input"
                value={form.startTime}
                onChange={handleChange}
              />
            </div>

            <div className="form-field">
              <label className="form-label">Thời gian kết thúc sự kiện</label>
              <br />
              <input
                type="datetime-local"
                name="endTime"
                className="form-input"
                value={form.endTime}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Địa điểm */}
          <div className="form-field">
            <label className="form-label">Địa điểm</label>
            <br />
            <input
              type="text"
              name="location"
              className="form-input"
              value={form.location}
              onChange={handleChange}
              placeholder="Ví dụ: Nhà hát Lớn Hà Nội"
            />
          </div>

          {/* Mô tả */}
          <div className="form-field">
            <label className="form-label">Mô tả</label>
            <br />
            <textarea
              name="description"
              className="form-textarea"
              value={form.description}
              onChange={handleChange}
              placeholder="Mô tả ngắn về sự kiện, nghệ sĩ, nội dung chương trình..."
              rows={4}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Ảnh sự kiện (thumbnail)</label>
            <br />
            <input 
              type="file" 
              accept="image/*"
              onChange={handleImageChange}
            />
            {imagePreview && (
              <img 
                src={imagePreview} 
                alt="preview" 
                style={{ width: "200px", marginTop: "10px", borderRadius: "8px" }}
              />
            )}
          </div>


          {/* Giá & Số lượng & Giới hạn */}
          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Giá vé (ETH)</label>
              <br />
              <input
                type="number"
                step="0.0001"
                min="0"
                name="ticketPriceEth"
                className="form-input"
                value={form.ticketPriceEth}
                onChange={handleChange}
                placeholder="0.01"
              />
            </div>

            <div className="form-field">
              <label className="form-label">Số lượng vé</label>
              <br />
              <input
                type="number"
                min="1"
                name="maxSupply"
                className="form-input"
                value={form.maxSupply}
                onChange={handleChange}
                placeholder="1000"
              />
            </div>

            <div className="form-field">
              <label className="form-label">Giới hạn số vé / người</label>
              <br />
              <input
                type="number"
                min="1"
                name="maxTicketsPerAddress"
                className="form-input"
                value={form.maxTicketsPerAddress}
                onChange={handleChange}
                placeholder="4"
              />
            </div>
          </div>

          {/* Error / status */}
          {error && <p className="form-error">{error}</p>}
          {writeError && (
            <p className="form-error">
              {(writeError as any)?.shortMessage ||
                writeError?.message ||
                String(writeError)}
            </p>
          )}
          {successMsg && <p className="form-success">{successMsg}</p>}
          {isSuccess && txHash && (
            <p className="form-success">
              ✅ Giao dịch đã được xác nhận trên chain. (Tx: {txHash})
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="form-submit-btn"
            disabled={isPending || isConfirming}
          >
            {isPending || isConfirming ? "Đang gửi giao dịch..." : "Tạo sự kiện"}
          </button>
        </form>

        {/* Thông tin đầy đủ sự kiện đã tạo */}
        {createdEvent && (
          <div className="form-success-box">
            <h2>🎉 Sự kiện đã được tạo thành công</h2>
            <p>
              <strong>Tên sự kiện:</strong> {createdEvent.name}
            </p>
            <p>
              <strong>Symbol:</strong> {createdEvent.symbol}
            </p>
            <p>
              <strong>Địa điểm:</strong> {createdEvent.location || "—"}
            </p>
            <p>
              <strong>Thời gian bắt đầu bán vé:</strong>{" "}
              {createdEvent.startTime || "—"}
            </p>
            <p>
              <strong>Thời gian kết thúc sự kiện:</strong>{" "}
              {createdEvent.endTime || "—"}
            </p>
            <p>
              <strong>Giá vé:</strong> {createdEvent.ticketPriceEth} ETH
            </p>
            <p>
              <strong>Số lượng vé:</strong> {createdEvent.maxSupply}
            </p>
            <p>
              <strong>Giới hạn vé / người:</strong>{" "}
              {createdEvent.maxTicketsPerAddress}
            </p>
            <p>
              <strong>Mô tả:</strong>{" "}
              {createdEvent.description ? createdEvent.description : "—"}
            </p>
            {createdEvent.txHash && (
              <p>
                <strong>Tx hash:</strong>{" "}
                <code>{createdEvent.txHash}</code>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NewEventPage;
