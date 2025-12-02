import { useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useNavigate } from "react-router-dom";
import "./css/SignUp.css";

interface WalletInfo {
  address: string;
  privateKey: string;
}

const SignUpPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWallet(null);
    setAccountCreated(false);

    if (!username.trim() || !password.trim()) {
      setError("Username và password không được để trống.");
      return;
    }

    if (password.length < 6) {
      setError("Password phải có ít nhất 6 ký tự.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Gọi API backend để tạo tài khoản (GIẢ LẬP)
      await fakeSignUpApi(username, password);

      // 2. Tạo ví mới bằng viem
      const pk = generatePrivateKey(); // 0x... (hex)
      const account = privateKeyToAccount(pk);

      const newWallet: WalletInfo = {
        address: account.address,
        privateKey: pk,
      };

      setWallet(newWallet);
      setAccountCreated(true);

      // (Tuỳ chọn) lưu tạm vào localStorage để dùng sau
      // localStorage.setItem("wallet_" + username, JSON.stringify(newWallet));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Đã xảy ra lỗi khi tạo tài khoản.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => alert("Đã copy vào clipboard"))
      .catch(() => alert("Không thể copy, vui lòng copy thủ công."));
  };

  const handleGoToApp = () => {
    // Điều hướng về trang chính (ở đó app của bạn hiện Menu nếu wallet đã được connect)
    navigate("/", { replace: true });
  };

  return (
    <div className="signup-page">
      <div className="signup-card">
        <h1 className="signup-title">Sign up</h1>
        <p className="signup-subtitle">
          Tạo tài khoản mới và nhận ví Hardhat (address + private key)
        </p>

        <form className="signup-form" onSubmit={handleSubmit}>
          <label className="signup-label">
            Username
            <input
              type="text"
              className="signup-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="signup-label">
            Password
            <input
              type="password"
              className="signup-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          {error && <p className="signup-error">{error}</p>}

          <button
            type="submit"
            className="signup-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Đang tạo tài khoản..." : "Create account"}
          </button>
        </form>

        {accountCreated && wallet && (
          <div className="wallet-info">
            <h2>Ví Hardhat của bạn</h2>
            <p className="wallet-warning">
              ⚠️ Hãy lưu lại <strong>Private Key</strong> ở nơi an toàn.
              Bạn cần <strong>import private key này vào MetaMask / wallet</strong>{" "}
              rồi connect để sử dụng DApp.
            </p>

            <div className="wallet-row">
              <span className="wallet-label">Address:</span>
              <code className="wallet-value">{wallet.address}</code>
              <button
                type="button"
                className="wallet-copy-btn"
                onClick={() => copyToClipboard(wallet.address)}
              >
                Copy
              </button>
            </div>

            <div className="wallet-row">
              <span className="wallet-label">Private Key:</span>
              <code className="wallet-value wallet-value-private">
                {wallet.privateKey}
              </code>
              <button
                type="button"
                className="wallet-copy-btn wallet-copy-btn-danger"
                onClick={() => copyToClipboard(wallet.privateKey)}
              >
                Copy
              </button>
            </div>

            {/* Nút quay lại app / Menu */}
            <div style={{ marginTop: "1.5rem", textAlign: "right" }}>
              <button
                type="button"
                className="signup-button signup-button-secondary"
                onClick={handleGoToApp}
              >
                Go to app
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Fake API để minh hoạ — bạn thay bằng API thật (Node/Express/Nest/…)
async function fakeSignUpApi(username: string, _password: string) {
  // giả lập delay 500ms
  await new Promise((resolve) => setTimeout(resolve, 500));

  // ví dụ: nếu username trùng "admin" thì báo lỗi
  if (username.toLowerCase() === "admin") {
    throw new Error("Username đã tồn tại, vui lòng chọn username khác.");
  }

  return { ok: true };
}

export default SignUpPage;
