import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { formatUnits } from 'viem';
import { formatEventTimestamp } from '../utils';
import eventLogicContract from '../../contracts/EventTicketLogic.json';
import { BsFillCalendarWeekFill } from 'react-icons/bs';
import { MdLocationOn } from 'react-icons/md';
import { HiPlusSm, HiMinusSm } from 'react-icons/hi';

import '../css/EventDetailPage.css';

const EventDetailPage = () => {
  const { eventAddress } = useParams<{ eventAddress: `0x${string}` }>();
  const { address: userAddress } = useAccount();

  const {
    data: eventURIData,
    isLoading: isLoadingEventUri,
    isError: isErrorEventUri,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'eventURI',
  });

  const {
    data: startPurchaseTimeData,
    isLoading: isLoadingStartPurchaseTime,
    isError: isErrorStartPurchaseTime,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'startPurchaseTime',
  });
  const startPurchaseTime = Number(startPurchaseTimeData);

  const {
    data: ticketPriceData,
    isLoading: isLoadingPrice,
    isError: isErrorPrice,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'ticketPrice',
  });
  const ticketPriceWei = Number(ticketPriceData);

  const {
    data: maxTicketsData,
    isLoading: isLoadingMaxTickets,
    isError: isErrorMaxTickets,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'maxTicketsPerAddress',
  });
  const maxTicketsPerAddress = Number(maxTicketsData);

  const {
    data: purchasedData,
    isLoading: isLoadingPurchased,
    refetch: refetchPurchased,
    isError: isErrorPurchased,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'ticketsPurchased',
    args: [userAddress],
  });
  const ticketsPurchasedCount = Number(purchasedData);

  const {
    data: maxSupplyData,
    isLoading: isLoadingMaxSupply,
    isError: isErrorMaxSupply,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'maxSupply',
  });
  const maxSupply = Number(maxSupplyData);

  const {
    data: totalSupplyData,
    isLoading: isLoadingTotalSupply,
    isError: isErrorTotalSupply,
    refetch: refetchTotalSupply,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'totalSupply',
  });
  const totalSupply = Number(totalSupplyData);

  const {
    data: endTimeData,
    isLoading: isLoadingEndTime,
    isError: isErrorEndTime,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'eventEndTime',
  });
  const eventEndTime = Number(endTimeData);

  const {
    data: mintTxHash,
    writeContract,
    isPending: isMintingPending,
    isError: isMintingError,
    error: mintingError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isMintingSuccess } =
    useWaitForTransactionReceipt({ hash: mintTxHash });

  // Metadata IPFS
  const [eventJSON, setEventJSON] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isMetaLoading, setIsMetaLoading] = useState(false);

  const [quantity, setQuantity] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState<number>(
    Math.floor(Date.now() / 1000),
  );

  /**** useEffect ****/

  // Cập nhật currentTime mỗi giây
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch metadata từ IPFS local gateway
  useEffect(() => {
    if (!eventURIData) {
      setEventJSON(null);
      setFetchError(null);
      setIsMetaLoading(false);
      return;
    }

    const cid = String(eventURIData).replace(/^ipfs:\/\//, '');
    const url = `http://127.0.0.1:8080/ipfs/${cid}`;

    let cancelled = false;

    const fetchEventData = async () => {
      try {
        setIsMetaLoading(true);
        setFetchError(null);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch event data: HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!cancelled) {
          setEventJSON(data);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch event metadata (detail):', error);
          setFetchError(
            (error as Error).message || 'Failed to fetch event metadata',
          );
          setEventJSON(null);
        }
      } finally {
        if (!cancelled) {
          setIsMetaLoading(false);
        }
      }
    };

    fetchEventData();

    return () => {
      cancelled = true;
    };
  }, [eventURIData]);

  // Refetch sau khi mint thành công
  useEffect(() => {
    if (isMintingSuccess) {
      refetchPurchased();
      refetchTotalSupply();
      setQuantity(1);
    }
  }, [isMintingSuccess, refetchPurchased, refetchTotalSupply]);

  // Loading & Error
  const isLoading =
    isLoadingEventUri ||
    isLoadingStartPurchaseTime ||
    isLoadingPrice ||
    isLoadingMaxTickets ||
    isLoadingPurchased ||
    isLoadingMaxSupply ||
    isLoadingTotalSupply ||
    isLoadingEndTime ||
    isMetaLoading;

  if (isLoading) {
    return <p className="message loading-message">Loading event details...</p>;
  }

  const isError =
    isErrorEventUri ||
    isErrorStartPurchaseTime ||
    isErrorPrice ||
    isErrorMaxTickets ||
    isErrorPurchased ||
    isErrorMaxSupply ||
    isErrorTotalSupply ||
    isErrorEndTime ||
    !!fetchError;

  if (isError) {
    return (
      <p className="message error-message">
        Error loading contract data. Please try again.
      </p>
    );
  }

  /***** parsed JSON *****/
  const rawImage = (eventJSON?.coverImage || eventJSON?.image || '') as string;
  const coverImageCid = rawImage.startsWith('ipfs://')
    ? rawImage.replace(/^ipfs:\/\//, '')
    : rawImage;

  const bannerImageSrc = coverImageCid
    ? `http://127.0.0.1:8080/ipfs/${coverImageCid}`
    : '/placeholder-image.jpg';

  const name = eventJSON?.name ?? '';
  const location = eventJSON?.location ?? '';
  const formattedDate = formatEventTimestamp(Number(eventEndTime));
  const description = eventJSON?.detailedDescription ?? '';

  /***** status of the event *****/
  const isEventFinished = Number.isFinite(eventEndTime)
    ? currentTime >= eventEndTime
    : false;

  const isComingSoon =
    !isEventFinished && Number.isFinite(startPurchaseTime)
      ? currentTime < startPurchaseTime
      : false;

  const remainingSupply =
    Number.isFinite(maxSupply) && Number.isFinite(totalSupply)
      ? Math.max(0, maxSupply - totalSupply)
      : undefined;

  const isSoldOut =
    !isEventFinished &&
    remainingSupply !== undefined &&
    remainingSupply <= 0;

  const lowSupplyThreshold = Number.isFinite(maxSupply)
    ? Math.floor(maxSupply * 0.25)
    : 0;

  const isLowSupply =
    !isSoldOut &&
    remainingSupply !== undefined &&
    remainingSupply > 0 &&
    remainingSupply <= lowSupplyThreshold;

  /***** purchase logic *****/
  const remainingAllowancePerUser = Number.isFinite(maxTicketsPerAddress)
    ? Math.max(0, maxTicketsPerAddress - ticketsPurchasedCount)
    : Infinity;

  const effectiveMaxQuantity =
    !isEventFinished && !isSoldOut && remainingSupply !== undefined
      ? Math.min(remainingAllowancePerUser, remainingSupply)
      : 0;

  const incrementQuantity = () => {
    if (quantity < effectiveMaxQuantity) {
      setQuantity(quantity + 1);
    }
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const handlePurchase = () => {
    if (
      !eventAddress ||
      !Number.isFinite(ticketPriceWei) ||
      quantity <= 0 ||
      !Number.isFinite(maxTicketsPerAddress) ||
      isEventFinished ||
      isSoldOut ||
      !Number.isFinite(remainingSupply) ||
      remainingSupply === undefined
    )
      return;

    if (quantity > remainingAllowancePerUser) {
      alert(
        `You can only purchase ${remainingAllowancePerUser} more tickets (Max per address: ${maxTicketsPerAddress}, You have: ${ticketsPurchasedCount}).`,
      );
      return;
    }
    if (quantity > remainingSupply) {
      alert(
        `Only ${remainingSupply} tickets are left in total. Please reduce the quantity.`,
      );
      return;
    }

    writeContract({
      address: eventAddress as `0x${string}`,
      abi: eventLogicContract.abi,
      functionName: 'mintTickets',
      args: [BigInt(quantity)],
      value: BigInt(ticketPriceWei) * BigInt(quantity),
    });
  };

  const formattedPrice = ticketPriceWei
    ? formatUnits(BigInt(ticketPriceWei), 18)
    : '...';
  const subtotalWei = ticketPriceWei
    ? BigInt(ticketPriceWei) * BigInt(quantity)
    : BigInt(0);
  const formattedSubtotal = formatUnits(subtotalWei, 18);

  const getTransactionStatus = () => {
    if (isMintingPending) return 'Sending transaction...';
    if (isConfirming) return 'Waiting for confirmation...';
    if (isMintingSuccess) return 'Purchase successful!';
    if (isMintingError)
      return `Purchase error: ${
        mintingError?.message || 'Unknown error'
      }`;
    return null;
  };

  const renderStatusOrPurchaseSection = () => {
    if (isEventFinished) {
      return (
        <div className="content-section status-section event-finished-section">
          <h2>Event Finished</h2>
          <p>This event has already concluded.</p>
        </div>
      );
    } else if (isSoldOut) {
      return (
        <div className="content-section status-section sold-out-section">
          <h2>Sold Out</h2>
          <p>All tickets for this event have been purchased.</p>
        </div>
      );
    } else if (isComingSoon) {
      return (
        <div className="content-section status-section coming-soon-section">
          <h2>Coming Soon</h2>
          <p>
            Ticket sales will begin on: <br />
            <strong>{formatEventTimestamp(startPurchaseTime)}</strong>
          </p>
        </div>
      );
    } else {
      return (
        <div className="content-section purchase-section">
          <h2>Purchase Tickets</h2>
          {isLowSupply && (
            <p className="low-supply-warning">
              Only {remainingSupply} tickets left!
            </p>
          )}

          <div className="ticket-info">
            <p>
              Price per ticket: <strong>{formattedPrice} ETH</strong>
            </p>

            {maxTicketsPerAddress < maxSupply && (
              <p>
                Limit per address:{' '}
                <strong>{maxTicketsPerAddress}</strong>
              </p>
            )}

            <p>
              You have purchased:{' '}
              <strong>{ticketsPurchasedCount}</strong> tickets
            </p>
          </div>

          {effectiveMaxQuantity > 0 && (
            <div className="purchase-form">
              <label
                htmlFor="quantity-display"
                className="quantity-label"
              >
                Quantity:
              </label>

              <div className="quantity-selector">
                <button
                  className="quantity-button"
                  onClick={decrementQuantity}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  <HiMinusSm />
                </button>

                <span
                  id="quantity-display"
                  className="quantity-display"
                  aria-live="polite"
                >
                  {quantity}
                </span>
                <button
                  className="quantity-button"
                  onClick={incrementQuantity}
                  disabled={
                    quantity >= effectiveMaxQuantity ||
                    effectiveMaxQuantity <= 0
                  }
                  aria-label="Increase quantity"
                >
                  <HiPlusSm />
                </button>
              </div>

              {remainingAllowancePerUser !== Infinity &&
                effectiveMaxQuantity < remainingAllowancePerUser && (
                  <p className="message info-message">
                    You can buy a maximum of{' '}
                    {Math.min(
                      remainingAllowancePerUser,
                      remainingSupply ?? Infinity,
                    )}{' '}
                    tickets due to stock limitations.
                  </p>
                )}

              <p className="subtotal">
                Subtotal:{' '}
                <strong>{formattedSubtotal} ETH</strong>
              </p>
              <button
                className="button button-primary"
                onClick={handlePurchase}
                disabled={
                  isMintingPending ||
                  isConfirming ||
                  quantity <= 0 ||
                  quantity > effectiveMaxQuantity ||
                  effectiveMaxQuantity <= 0
                }
              >
                {isMintingPending || isConfirming
                  ? 'Processing...'
                  : 'Purchase Tickets'}
              </button>
            </div>
          )}

          {remainingAllowancePerUser <= 0 &&
            maxTicketsPerAddress !== undefined && (
              <p className="message info-message">
                You have reached the purchase limit (
                {maxTicketsPerAddress} tickets) for your address.
              </p>
            )}

          {effectiveMaxQuantity <= 0 &&
            remainingAllowancePerUser > 0 && (
              <p className="message info-message">
                No more tickets available to purchase.
              </p>
            )}

          {getTransactionStatus() && (
            <p
              className={`message ${
                isMintingSuccess ? 'success-message' : ''
              } ${isMintingError ? 'error-message' : ''}`}
            >
              {getTransactionStatus()}
            </p>
          )}
          {mintTxHash && (
            <p className="transaction-hash">
              Tx Hash:{' '}
              <a
                href={`https://sepolia.etherscan.io/tx/${mintTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {mintTxHash.substring(0, 6)}...
                {mintTxHash.substring(mintTxHash.length - 4)}
              </a>
            </p>
          )}
        </div>
      );
    }
  };

  return (
    <div className="event-detail-page page-container">
      <div className="event-header">
        <img
          className="event-banner-image"
          src={bannerImageSrc}
          alt={`${name || 'Event'} banner`}
          onError={e => {
            const target = e.target as HTMLImageElement;
            target.onerror = null;
            target.src = '/placeholder-image.jpg';
          }}
        />

        <h1 className="event-title-main">
          {name || 'Event Details'}
        </h1>

        <div className="event-meta">
          <p>
            <BsFillCalendarWeekFill aria-hidden="true" />
            {formattedDate}
          </p>
          <p>
            <MdLocationOn aria-hidden="true" />
            {location || 'Location TBD'}
          </p>
        </div>
      </div>

      <div className="event-content-area">
        {renderStatusOrPurchaseSection()}

        <div className="content-section description-section">
          <h3>Event Description</h3>
          <p className="event-detail-description">
            {description || 'No description available.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default EventDetailPage;
