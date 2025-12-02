import { useMemo } from 'react';
import { useReadContract, useReadContracts, useWriteContract, useAccount } from 'wagmi';
import type { Abi } from 'abitype';
import { Link } from 'react-router-dom';

// abis
import factoryContract from '../../contracts/EventTicketFactory.json';
import eventLogicContract from '../../contracts/EventTicketLogic.json';
// address
import factoryAddr from '../../contracts/FactoryAddress.json';

// custom components
import FirstEventCard from './FirstEventCard';
import EventCard from './EventCard';
import PageTitle from '../PageTitle';

import '../css/EventGrid.css';

/**
 * Định dạng timestamp (seconds) sang chuỗi ngày giờ đẹp mắt.
 * Nếu không hợp lệ → trả về "TBA".
 */
export function formatEventTimestamp(ts?: bigint | number): string {
  if (ts === undefined || ts === null) return 'TBA';
  const num = typeof ts === 'bigint' ? Number(ts) : ts;
  if (!Number.isFinite(num) || num <= 0) return 'TBA';

  const date = new Date(num * 1000);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type AdminEventRow = {
  address: `0x${string}`;
  name: string;
  saleStart: bigint;
  eventDate: bigint;
  maxSupply: bigint;
  sold: bigint;
  isCancelled: boolean;
};

const EventGrid = () => {
  const { address: userAddress } = useAccount();
  const { writeContractAsync, isPending: isCancelling } = useWriteContract();

  // 1. Lấy danh sách tất cả event từ Factory
  const {
    data: allEventsData,
    isLoading: isLoadingEvents,
    isError: isErrorEvents,
  } = useReadContract({
    abi: factoryContract.abi,
    address: factoryAddr.address as `0x${string}`,
    functionName: 'getEvents',
  });

  const allEvents: `0x${string}`[] = useMemo(() => {
    if (Array.isArray(allEventsData)) {
      console.log(allEventsData as `0x${string}`[]);
      return allEventsData as `0x${string}`[];
    }
    return [];
  }, [allEventsData]);

  // 2. RBAC: check admin từ event đầu tiên
  const targetEventForAdminCheck: `0x${string}` =
    allEvents[0] ?? (factoryAddr.address as `0x${string}`);

  const { data: isAdminData } = useReadContract({
    address: targetEventForAdminCheck,
    abi: eventLogicContract.abi as Abi,
    functionName: 'admins',
    args: [(userAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`],
    query: {
      // chỉ gọi khi có user + có ít nhất 1 event
      enabled: !!userAddress && allEvents.length > 0,
    },
  });

  const isAdmin = Boolean(isAdminData);

  // 3. Đọc eventEndTime cho tất cả event (dùng cho Active grid)
  const eventEndTimeContracts = useMemo(
    () =>
      allEvents.map((eventAddress) => ({
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'eventEndTime',
      })),
    [allEvents],
  );

  const {
    data: endTimeData,
    isLoading: isLoadingEndTime,
    isError: isErrorEndTime,
  } = useReadContracts({
    contracts: eventEndTimeContracts,
    query: { enabled: !isLoadingEvents && allEvents.length > 0 },
  });

  // 4. Admin: đọc info chi tiết của event để hiển thị bảng
  const adminInfoContracts = useMemo(() => {
    if (!isAdmin || allEvents.length === 0) return [];

    return allEvents.flatMap((eventAddress) => [
      {
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'name',
      },
      {
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'startPurchaseTime',
      },
      {
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'eventEndTime',
      },
      {
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'maxSupply',
      },
      {
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'totalSupply',
      },
      {
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'isCancelled',
      },
    ]);
  }, [isAdmin, allEvents]);

  const {
    data: adminInfoData,
    isLoading: isLoadingAdminInfo,
    isError: isErrorAdminInfo,
  } = useReadContracts({
    contracts: adminInfoContracts,
    query: {
      enabled: isAdmin && allEvents.length > 0,
    },
  });

  const adminEvents: AdminEventRow[] = useMemo(() => {
    if (!isAdmin || !adminInfoData || !Array.isArray(adminInfoData)) return [];

    const result: AdminEventRow[] = [];
    const FIELDS_PER_EVENT = 6;

    for (let i = 0; i < allEvents.length; i++) {
      const baseIndex = i * FIELDS_PER_EVENT;
      if (baseIndex + FIELDS_PER_EVENT > adminInfoData.length) break;

      const nameRes = adminInfoData[baseIndex + 0] as {
        result?: string;
        status: 'success' | 'failure';
      };
      const startRes = adminInfoData[baseIndex + 1] as {
        result?: bigint;
        status: 'success' | 'failure';
      };
      const endRes = adminInfoData[baseIndex + 2] as {
        result?: bigint;
        status: 'success' | 'failure';
      };
      const maxSupplyRes = adminInfoData[baseIndex + 3] as {
        result?: bigint;
        status: 'success' | 'failure';
      };
      const totalSupplyRes = adminInfoData[baseIndex + 4] as {
        result?: bigint;
        status: 'success' | 'failure';
      };
      const cancelledRes = adminInfoData[baseIndex + 5] as {
        result?: boolean;
        status: 'success' | 'failure';
      };

      if (
        nameRes.status !== 'success' ||
        startRes.status !== 'success' ||
        endRes.status !== 'success' ||
        maxSupplyRes.status !== 'success' ||
        totalSupplyRes.status !== 'success' ||
        cancelledRes.status !== 'success'
      ) {
        continue;
      }

      result.push({
        address: allEvents[i],
        name: nameRes.result ?? '',
        saleStart: startRes.result ?? 0n,
        eventDate: endRes.result ?? 0n,
        maxSupply: maxSupplyRes.result ?? 0n,
        sold: totalSupplyRes.result ?? 0n,
        isCancelled: Boolean(cancelledRes.result),
      });
    }

    return result;
  }, [isAdmin, adminInfoData, allEvents]);

  // 5. Lọc các event đang active (eventEndTime > now)
  const activeEvents = useMemo(() => {
    if (endTimeData && !isLoadingEndTime && Array.isArray(endTimeData)) {
      const currentTimeSeconds = BigInt(Math.floor(Date.now() / 1000));

      const addresses: `0x${string}`[] = [];
      const endTimes: bigint[] = [];

      endTimeData.forEach((result, index) => {
        const r = result as { result?: bigint; status: 'success' | 'failure' };

        if (r.status === 'success' && r.result !== null && r.result !== undefined) {
          if (r.result > currentTimeSeconds) {
            addresses.push(allEvents[index]);
            endTimes.push(r.result);
          }
        }
      });

      return { addresses, endTimes };
    }
    return { addresses: [], endTimes: [] };
  }, [allEvents, endTimeData, isLoadingEndTime]);

  // 6. Gọi cancelEvent trên một event (Admin)
  const handleCancelEvent = async (eventAddress: `0x${string}`) => {
    const confirm = window.confirm('Bạn có chắc chắn muốn hủy sự kiện này?');
    if (!confirm) return;

    try {
      await writeContractAsync({
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'cancelEvent',
        args: [],
      });
      // Có thể thêm toast/notification nếu bạn đang dùng
      console.log('Event cancelled:', eventAddress);
    } catch (error) {
      console.error('Cancel event error:', error);
      // TODO: show error UI nếu bạn muốn
    }
  };

  const isLoading = isLoadingEvents || isLoadingEndTime || isLoadingAdminInfo;
  const isError = isErrorEvents || isErrorEndTime || isErrorAdminInfo;

  if (isLoading) return <p>Loading Active Events...</p>;
  if (isError)
    return (
      <p className="message error-message">
        Error: Something went wrong loading the active events
      </p>
    );

  return (
  <>
    <PageTitle />

    {/* Nếu là admin → chỉ hiển thị phần quản lý, ẩn EventGrid */}
    {isAdmin ? (
      <>
        <div className="create-event-container">
          <Link to="/events/new" className="button create-event-button">
            + Tạo sự kiện mới
          </Link>
        </div>

        <section className="admin-events-section">
          <h2 className="admin-events-title">Quản lý sự kiện</h2>

          {adminEvents.length === 0 ? (
            <p className="admin-events-empty">Chưa có sự kiện nào.</p>
          ) : (
            <div className="admin-events-table-wrapper">
              <table className="admin-events-table">
                <thead>
                  <tr>
                    <th>Tên sự kiện</th>
                    <th>Ngày tổ chức</th>
                    <th>Ngày mở bán vé</th>
                    <th>Vé đã bán / Tổng vé</th>
                    <th>Trạng thái</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {adminEvents.map((ev) => (
                    <tr key={ev.address}>
                      <td>{ev.name}</td>
                      <td>{formatEventTimestamp(ev.eventDate)}</td>
                      <td>{formatEventTimestamp(ev.saleStart)}</td>
                      <td>
                        {ev.sold.toString()} / {ev.maxSupply.toString()}
                      </td>
                      <td>
                        {ev.isCancelled ? (
                          <span className="badge badge-cancelled">Đã hủy</span>
                        ) : (
                          <span className="badge badge-active">Đang hoạt động</span>
                        )}
                      </td>
                      <td>
                        {!ev.isCancelled && (
                          <button
                            className="admin-cancel-button"
                            onClick={() => handleCancelEvent(ev.address)}
                            disabled={isCancelling}
                          >
                            {isCancelling ? 'Đang hủy...' : 'Hủy sự kiện'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    ) : (
      // Người dùng thường → hiển thị EventGrid
      <div className="event-grid">
        {activeEvents.addresses.length === 0 && (
          <p>There are no active events at this time</p>
        )}

        {activeEvents.addresses.length > 0 && (
          <div className="first-event-card-wrapper">
            <FirstEventCard
              eventAddress={activeEvents.addresses[0]}
              eventEndTime={activeEvents.endTimes[0]}
            />
          </div>
        )}

        {activeEvents.addresses.slice(1).map((addr, i) => (
          <EventCard
            key={addr}
            eventAddress={addr}
            eventEndTime={activeEvents.endTimes[i + 1]}
          />
        ))}
      </div>
    )}
  </>
);

};

export default EventGrid;
