import { useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';

import factoryContract from '../contracts/EventTicketFactory.json';
import factoryAddr from '../contracts/FactoryAddress.json';
import './css/OrganizerPage.css';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const OrganizerPage = () => {
  const { address: userAddress } = useAccount();
  const [targetAddress, setTargetAddress] = useState('');
  const [isGrant, setIsGrant] = useState(true); // true = cấp, false = thu hồi
  const [checkAddress, setCheckAddress] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Đọc owner & factoryAdmin status để xác định quyền
  const { data: factoryOwner } = useReadContract({
    address: factoryAddr.address as `0x${string}`,
    abi: factoryContract.abi,
    functionName: 'owner',
  });

  const { data: isFactoryAdmin } = useReadContract({
    address: factoryAddr.address as `0x${string}`,
    abi: factoryContract.abi,
    functionName: 'factoryAdmins',
    args: [userAddress ?? ZERO_ADDRESS],
    query: { enabled: !!userAddress },
  });

  const isAdmin =
    !!userAddress &&
    (userAddress.toLowerCase() === (factoryOwner as string | undefined)?.toLowerCase() ||
      Boolean(isFactoryAdmin));

  // Check trạng thái organizer của một địa chỉ bất kỳ
  const { data: isOrganizerChecked, refetch: refetchOrganizerStatus } = useReadContract({
    address: factoryAddr.address as `0x${string}`,
    abi: factoryContract.abi,
    functionName: 'organizers',
    args: [checkAddress || ZERO_ADDRESS],
    query: {
      enabled: false, // gọi thủ công bằng refetch
    },
  });

  const { data: txHash, writeContract, isPending } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!isAdmin) {
      setStatusMessage('❌ Bạn không có quyền (chỉ Owner hoặc FactoryAdmin).');
      return;
    }

    if (!targetAddress || !targetAddress.startsWith('0x') || targetAddress.length !== 42) {
      setStatusMessage('⚠️ Địa chỉ không hợp lệ.');
      return;
    }

    try {
      await writeContract({
        address: factoryAddr.address as `0x${string}`,
        abi: factoryContract.abi,
        functionName: 'setOrganizer',
        args: [targetAddress as `0x${string}`, isGrant],
      });
      setStatusMessage('⏳ Đang gửi transaction, vui lòng chờ xác nhận...');
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`❌ Lỗi gửi transaction: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleCheckStatus = async () => {
    if (!checkAddress || !checkAddress.startsWith('0x') || checkAddress.length !== 42) {
      setStatusMessage('⚠️ Địa chỉ cần kiểm tra không hợp lệ.');
      return;
    }
    try {
      const res = await refetchOrganizerStatus();
      const val = res.data as boolean | undefined;
      setStatusMessage(
        `ℹ️ Địa chỉ ${checkAddress} hiện đang ${val ? '✅ là Organizer' : '❌ không phải Organizer'}.`,
      );
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`❌ Lỗi kiểm tra trạng thái: ${err?.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="organizer-page">
      <h1 className="organizer-title">Quản lý Organizer (Factory)</h1>

      <p className="organizer-subtitle">
        Chỉ <strong>Owner</strong> hoặc <strong>FactoryAdmin</strong> mới có thể cấp/thu hồi quyền
        Organizer.
      </p>

      {!isAdmin && (
        <div className="organizer-warning">
          Bạn đang đăng nhập với địa chỉ không có quyền admin.  
          Bạn vẫn có thể kiểm tra trạng thái Organizer nhưng không thể thay đổi.
        </div>
      )}

      <section className="organizer-section">
        <h2>1. Cấp / Thu hồi Organizer</h2>
        <form onSubmit={handleSubmit} className="organizer-form">
          <label className="organizer-label">
            Địa chỉ ví (EVM):
            <input
              type="text"
              className="organizer-input"
              placeholder="0x..."
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value.trim())}
            />
          </label>

          <label className="organizer-label">
            Hành động:
            <select
              className="organizer-select"
              value={isGrant ? 'grant' : 'revoke'}
              onChange={(e) => setIsGrant(e.target.value === 'grant')}
            >
              <option value="grant">Grant Organizer</option>
              <option value="revoke">Revoke Organizer</option>
            </select>
          </label>

          <button
            type="submit"
            className="organizer-button"
            disabled={isPending || isTxLoading || !isAdmin}
          >
            {isPending || isTxLoading
              ? 'Đang gửi transaction...'
              : isGrant
              ? 'Cấp Organizer'
              : 'Thu hồi Organizer'}
          </button>

          {isTxSuccess && (
            <div className="organizer-success">
              ✅ Transaction đã được xác nhận. Organizer đã được cập nhật.
            </div>
          )}
        </form>
      </section>

      <section className="organizer-section">
        <h2>2. Kiểm tra trạng thái Organizer</h2>
        <div className="organizer-check">
          <input
            type="text"
            className="organizer-input"
            placeholder="0x..."
            value={checkAddress}
            onChange={(e) => setCheckAddress(e.target.value.trim())}
          />
          <button type="button" className="organizer-button" onClick={handleCheckStatus}>
            Kiểm tra
          </button>
        </div>
        {typeof isOrganizerChecked === 'boolean' && (
          <div className="organizer-info">
            Địa chỉ {checkAddress || '(chưa nhập)'} hiện đang{' '}
            {isOrganizerChecked ? '✅ là Organizer' : '❌ không phải Organizer'}.
          </div>
        )}
      </section>

      {statusMessage && <div className="organizer-status">{statusMessage}</div>}
    </div>
  );
};

export default OrganizerPage;
