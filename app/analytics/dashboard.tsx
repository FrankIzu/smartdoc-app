import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useEnhanced2FAAuth } from '../../contexts/Enhanced2FAAuthContext';
import { useThemeColors } from '../../hooks/useThemeColors';
import { apiClient } from '../../services/api';

interface ComprehensiveAnalytics {
  receipts: {
    summary: {
      total_receipts: number;
      total_amount: number;
      average_amount: number;
      period_days: number;
      total_tax?: number;
      recent_30d?: number;
      recent_90d?: number;
    };
    categories: Array<{
      category: string;
      count: number;
      total_amount: number;
      percentage: number;
    }>;
    timeline: Array<{
      month: string;
      count: number;
      total_amount: number;
    }>;
    payment_methods: Array<{
      method: string;
      count: number;
      total_amount: number;
    }>;
    top_businesses: Array<{
      business: string;
      count: number;
      total_amount: number;
    }>;
  };
  files: {
    types: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
    upload_trends: Array<{
      date: string;
      count: number;
    }>;
  };
  workspaces: {
    total_workspaces: number;
    workspace_details: Array<{
      name: string;
      file_count: number;
      member_count: number;
    }>;
  };
  forms: {
    total_forms: number;
    total_responses: number;
    form_details: Array<{
      name: string;
      response_count: number;
    }>;
  };
  summary: {
    period: string;
    period_days: number;
    total_files: number;
    total_documents?: number;
    total_chats?: number;
    total_size_mb: number;
    total_receipts: number;
    total_spending: number;
    total_workspaces: number;
    total_forms: number;
    total_invoices?: number;
    total_invoice_amount?: number;
  };
  invoices?: {
    overview: {
      total_invoices: number;
      total_amount: number;
      paid_amount: number;
      unpaid_amount: number;
      partial_amount: number;
      avg_invoice_amount: number;
      paid_count: number;
      unpaid_count: number;
      partial_count: number;
      overdue_count: number;
      overdue_amount: number;
    };
    payment_distribution: Array<{status: string; count: number; total_amount: number; percentage: number}>;
    category_distribution: Array<{category: string; count: number; total_amount: number; avg_amount: number; percentage: number}>;
    monthly_trends: Array<{month: string; month_key: string; count: number; total_amount: number; paid_count: number; unpaid_count: number}>;
    top_vendors: Array<{vendor_name: string; count: number; total_amount: number; avg_amount: number}>;
    aging_buckets: {
      '0-30': {count: number; amount: number};
      '31-60': {count: number; amount: number};
      '61-90': {count: number; amount: number};
      '90+': {count: number; amount: number};
    };
  };
  recentActivity?: string[];
}

const { width } = Dimensions.get('window');

export default function AnalyticsDashboard() {
  const router = useRouter();
  const { isAuthenticated, user, isLoading: authLoading } = useEnhanced2FAAuth();
  const colors = useThemeColors();
  const [analytics, setAnalytics] = useState<ComprehensiveAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState('30'); // Default to 30 days
  const [selectedCategory, setSelectedCategory] = useState('All'); // Category filter for receipts
  const [selectedInvoiceCategory, setSelectedInvoiceCategory] = useState('All'); // Category filter for invoices
  const [activeTab, setActiveTab] = useState<'receipts' | 'invoices'>('receipts');
  const [recentReceipts, setRecentReceipts] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  
  // Category selection modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [categorizingReceipt, setCategorizingReceipt] = useState(false);
  
  // Payment status selection modal states
  const [showPaymentStatusModal, setShowPaymentStatusModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [updatingPaymentStatus, setUpdatingPaymentStatus] = useState(false);

  console.log('📊 AnalyticsDashboard component loaded', { isAuthenticated, user: user?.username, authLoading });

  const loadAnalytics = async (days = timePeriod) => {
    try {
      setLoading(true);
      console.log('🔍 Loading analytics for', days, 'days');
      console.log('📊 Current state:', { 
        isAuthenticated, 
        authLoading, 
        loading: true, 
        hasAnalytics: !!analytics,
        recentReceiptsCount: recentReceipts.length
      });
      
      // Check authentication first
      if (!isAuthenticated) {
        console.warn('📊 User not authenticated, cannot load analytics');
        const noAuthData = {
          summary: {
            period: `${days} days`,
            period_days: parseInt(days),
            total_files: 0,
            total_size_mb: 0,
            total_receipts: 0,
            total_spending: 0,
            total_workspaces: 0,
            total_forms: 0,
          },
          receipts: {
            summary: {
              total_receipts: 0,
              total_amount: 0,
              average_amount: 0,
              period_days: parseInt(days),
            },
            categories: [],
            timeline: [],
            payment_methods: [],
            top_businesses: [],
          },
          files: {
            types: [],
            upload_trends: [],
          },
          workspaces: {
            total_workspaces: 0,
            workspace_details: [],
          },
          forms: {
            total_forms: 0,
            total_responses: 0,
            form_details: [],
          },
          recentActivity: [],
        };
        setAnalytics(noAuthData);
        setRecentReceipts([]);
        setRecentInvoices([]);
        setLoading(false);
        return;
      }
      
      // Use web endpoints for receipt and invoice analytics
      console.log('📊 Loading analytics from web endpoints...');
      
      // Load receipt analytics from web endpoint
      let receiptAnalytics: any = null;
      try {
        const category = selectedCategory !== 'All' ? selectedCategory : undefined;
        const receiptResponse = await apiClient.getReceiptAnalytics(parseInt(days), category);
        console.log('📊 Receipt analytics response:', {
          success: receiptResponse?.success,
          hasData: !!receiptResponse?.data,
          dataKeys: receiptResponse?.data ? Object.keys(receiptResponse.data) : [],
          hasOverview: !!receiptResponse?.data?.overview,
          totalReceipts: receiptResponse?.data?.overview?.total_receipts,
          categoriesCount: receiptResponse?.data?.category_distribution?.length || 0,
          hasRecentReceipts: !!receiptResponse?.data?.recent_receipts,
          message: receiptResponse?.message
        });
        if (receiptResponse && receiptResponse.success && receiptResponse.data) {
          // Backend returns: {overview, category_distribution, monthly_spending, recent_receipts, top_businesses}
          // Transform to expected structure: {summary, categories, timeline, payment_methods, top_businesses}
          const totalReceipts = receiptResponse.data.overview?.total_receipts || 0;
          const totalAmount = receiptResponse.data.overview?.total_amount || 0;
          // Calculate average amount if not provided or is 0
          const averageAmount = receiptResponse.data.overview?.average_amount || 
                                (totalReceipts > 0 ? totalAmount / totalReceipts : 0);
          
          receiptAnalytics = {
            summary: {
              total_receipts: totalReceipts,
              total_amount: totalAmount,
              average_amount: averageAmount,
              period_days: parseInt(days),
              recent_30d: receiptResponse.data.overview?.recent_30d || 0,
            },
            categories: receiptResponse.data.category_distribution || [],
            timeline: receiptResponse.data.monthly_spending || [],
            payment_methods: receiptResponse.data.payment_methods || [],
            top_businesses: receiptResponse.data.top_businesses || [],
            recent_receipts: receiptResponse.data.recent_receipts || [],
          };
          console.log('✅ Receipt analytics transformed:', {
            totalReceipts: receiptAnalytics.summary.total_receipts,
            totalAmount: receiptAnalytics.summary.total_amount,
            categoriesCount: receiptAnalytics.categories.length
          });
        } else if (receiptResponse && !receiptResponse.success) {
          // API returned an error response (not an exception)
          console.warn('❌ Receipt analytics endpoint returned error:', receiptResponse.message);
        }
      } catch (error) {
        console.warn('❌ Receipt analytics endpoint failed with exception:', error);
      }
      
      // Load invoice analytics from web endpoint
      let invoiceAnalytics = null;
      try {
        const category = selectedInvoiceCategory !== 'All' ? selectedInvoiceCategory : undefined;
        const invoiceResponse = await apiClient.getInvoiceAnalytics(parseInt(days), category);
        if (invoiceResponse && invoiceResponse.success && invoiceResponse.data) {
          invoiceAnalytics = invoiceResponse.data;
          console.log('✅ Invoice analytics loaded from web endpoint');
        } else if (invoiceResponse && !invoiceResponse.success) {
          // API returned an error response (not an exception)
          console.warn('❌ Invoice analytics endpoint returned error:', invoiceResponse.message);
        }
      } catch (error) {
        // This catch block should rarely be hit now since API service returns error response
        console.warn('❌ Invoice analytics endpoint failed with exception:', error);
      }
      
      // Combine receipt and invoice analytics into comprehensive format
      console.log('📊 Building analyticsData with receiptAnalytics:', {
        hasReceiptAnalytics: !!receiptAnalytics,
        hasSummary: !!receiptAnalytics?.summary,
        totalReceipts: receiptAnalytics?.summary?.total_receipts,
        totalAmount: receiptAnalytics?.summary?.total_amount,
        categoriesCount: receiptAnalytics?.categories?.length || 0
      });
      
      const analyticsData: ComprehensiveAnalytics = {
        summary: {
          period: `${days} days`,
          period_days: parseInt(days),
          total_files: 0,
          total_size_mb: 0,
          total_receipts: receiptAnalytics?.summary?.total_receipts || 0,
          total_spending: receiptAnalytics?.summary?.total_amount || 0,
          total_workspaces: 0,
          total_forms: 0,
          total_invoices: invoiceAnalytics?.overview?.total_invoices || 0,
          total_invoice_amount: invoiceAnalytics?.overview?.total_amount || 0,
        },
        receipts: receiptAnalytics || {
          summary: {
            total_receipts: 0,
            total_amount: 0,
            average_amount: 0,
            period_days: parseInt(days),
          },
          categories: [],
          timeline: [],
          payment_methods: [],
          top_businesses: [],
        },
        invoices: invoiceAnalytics || undefined,
        files: {
          types: [],
          upload_trends: [],
        },
        workspaces: {
          total_workspaces: 0,
          workspace_details: [],
        },
        forms: {
          total_forms: 0,
          total_responses: 0,
          form_details: [],
        },
        recentActivity: [],
      };
      
      // Fetch all receipts from web files endpoint
      // This ensures we show all receipts, not just a limited set
      try {
        console.log('📊 Fetching receipts from files endpoint...');
        // Use web endpoint to get all receipts (category filter)
        const filesResponse = await apiClient.getDocuments(1, 10000, undefined, 'receipts');
        console.log('📊 Files response:', {
          success: filesResponse?.success,
          hasFiles: !!filesResponse?.files,
          filesCount: filesResponse?.files?.length || 0,
          hasDataFiles: !!filesResponse?.data?.files,
          dataFilesCount: filesResponse?.data?.files?.length || 0
        });
        
        if (filesResponse && filesResponse.success) {
          const allFiles = filesResponse.files || filesResponse.data?.files || filesResponse.data || [];
          console.log(`📊 Total files received: ${allFiles.length}`);
          
          // Log first 3 files to see their structure
          if (allFiles.length > 0) {
            console.log('📊 Sample file structure:', {
              firstFile: {
                id: allFiles[0].id,
                filename: allFiles[0].filename,
                file_kind: allFiles[0].file_kind,
                file_category: allFiles[0].file_category,
                category: allFiles[0].category,
                keys: Object.keys(allFiles[0])
              }
            });
          }
          
          // When category=receipts is passed, the backend should already filter
          // So we should use ALL returned files, not filter again
          // But let's be defensive and still check if file_kind exists and matches
          const receiptFiles = allFiles.filter((file: any) => {
            // If file_kind is set, it should be 'receipt' or 'receipts'
            // If file_kind is not set, include it (backend already filtered by category)
            const fileKind = (file.file_kind || '').toLowerCase();
            const hasNoFileKind = !file.file_kind || fileKind === '';
            const isReceiptFileKind = fileKind === 'receipt' || fileKind === 'receipts';
            return hasNoFileKind || isReceiptFileKind;
          });
          console.log(`📊 Filtered receipt files: ${receiptFiles.length} (from ${allFiles.length} total)`);
          
          // Sort by date (most recent first)
          const sortedReceipts = [...receiptFiles].sort((a: any, b: any) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
          });
          console.log(`✅ Loaded ${sortedReceipts.length} receipts for display`);
          setRecentReceipts(sortedReceipts);
          console.log('📊 Set recentReceipts to', sortedReceipts.length, 'receipts');
        } else {
          console.warn('❌ Files endpoint returned unsuccessful response');
          // Fallback to analytics recent_receipts if available
          if (receiptAnalytics?.recent_receipts && receiptAnalytics.recent_receipts.length > 0) {
            console.log(`📊 Using ${receiptAnalytics.recent_receipts.length} receipts from analytics`);
            setRecentReceipts(receiptAnalytics.recent_receipts);
          } else if (receiptAnalytics?.top_businesses && receiptAnalytics.top_businesses.length > 0) {
            // Convert top_businesses to receipt-like format for display
            console.log(`📊 Using ${receiptAnalytics.top_businesses.length} businesses as receipts from analytics`);
            const businessReceipts = receiptAnalytics.top_businesses.map((business: any, idx: number) => ({
              id: `business-${idx}`,
              business: business.business,
              json_data: {
                store_name: business.business,
                total_amount: business.total_amount
              },
              created_at: new Date().toISOString() // Use current date as fallback
            }));
            setRecentReceipts(businessReceipts);
          } else {
            console.warn('⚠️ No receipt data available from either source');
            setRecentReceipts([]);
          }
        }
      } catch (error) {
        console.error('❌ Failed to fetch all receipts:', error);
        // Fallback to analytics recent_receipts if available
        if (receiptAnalytics?.recent_receipts && receiptAnalytics.recent_receipts.length > 0) {
          console.log(`📊 Using ${receiptAnalytics.recent_receipts.length} receipts from analytics fallback`);
          setRecentReceipts(receiptAnalytics.recent_receipts);
        } else if (receiptAnalytics?.top_businesses && receiptAnalytics.top_businesses.length > 0) {
          // Convert top_businesses to receipt-like format for display
          console.log(`📊 Using ${receiptAnalytics.top_businesses.length} businesses as receipts from analytics fallback`);
          const businessReceipts = receiptAnalytics.top_businesses.map((business: any, idx: number) => ({
            id: `business-${idx}`,
            business: business.business,
            json_data: {
              store_name: business.business,
              total_amount: business.total_amount
            },
            created_at: new Date().toISOString()
          }));
          setRecentReceipts(businessReceipts);
        } else {
          console.warn('⚠️ No receipt data available from any source');
          setRecentReceipts([]);
        }
      }
      
      if (invoiceAnalytics?.recent_invoices) {
        // The recent_invoices from the analytics endpoint may have file IDs
        // We need to ensure each invoice has an invoice_id (invoice record ID)
        // If not present, we need to fetch invoices separately or transform the data
        console.log('📊 Processing recent invoices from analytics:', {
          count: invoiceAnalytics.recent_invoices.length,
          sampleInvoice: invoiceAnalytics.recent_invoices[0]
        });
        
        // Check if invoices already have invoice record IDs
        const hasInvoiceIds = invoiceAnalytics.recent_invoices.some((inv: any) => inv.invoice_id || inv.id);
        
        if (hasInvoiceIds) {
          // Invoices have IDs, use them directly
        setRecentInvoices(invoiceAnalytics.recent_invoices);
        } else {
          // Need to fetch invoice records to get invoice IDs
          try {
            console.log('📊 Fetching invoices from files endpoint to get invoice IDs...');
            const invoicesResponse = await apiClient.getDocuments(1, 10000, undefined, 'invoices');
            console.log('📊 Invoices response:', {
              success: invoicesResponse?.success,
              count: invoicesResponse?.files?.length || invoicesResponse?.data?.files?.length || 0
            });
            
            if (invoicesResponse && invoicesResponse.success) {
              const allInvoiceFiles = invoicesResponse.files || invoicesResponse.data?.files || invoicesResponse.data || [];
              console.log(`📊 Total invoice files received: ${allInvoiceFiles.length}`);
              
              // Use files with invoice file_kind
              const invoiceFiles = allInvoiceFiles.filter((file: any) => {
                const fileKind = (file.file_kind || '').toLowerCase();
                return fileKind === 'invoice' || fileKind === 'invoices';
              });
              
              console.log(`📊 Filtered invoice files: ${invoiceFiles.length}`);
              setRecentInvoices(invoiceFiles.slice(0, 50)); // Limit to 50 most recent
            } else {
              console.warn('⚠️ Failed to fetch invoice files, using analytics data');
              setRecentInvoices(invoiceAnalytics.recent_invoices);
            }
          } catch (error) {
            console.error('❌ Failed to fetch invoices:', error);
            // Fallback to analytics data
            setRecentInvoices(invoiceAnalytics.recent_invoices);
          }
        }
      } else {
        setRecentInvoices([]);
      }
      
      setAnalytics(analyticsData);
      console.log('✅ Analytics data set successfully');
      console.log('📊 Final state:', {
        hasAnalytics: !!analyticsData,
        receiptsCount: analyticsData.receipts?.summary?.total_receipts || 0,
        hasTopBusinesses: !!analyticsData.receipts?.top_businesses,
        topBusinessesCount: analyticsData.receipts?.top_businesses?.length || 0,
        hasRecentReceiptsInAnalytics: !!receiptAnalytics?.recent_receipts,
        recentReceiptsInAnalyticsCount: receiptAnalytics?.recent_receipts?.length || 0
      });
      setLoading(false);
      console.log('✅ Loading set to false');
    } catch (error) {
      console.error('❌ Failed to load analytics:', error);
      console.error('❌ Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      // Show basic data on error
      console.log('📊 API Error - Showing basic data');
      const basicData = {
        summary: {
          period: `${days} days`,
          period_days: parseInt(days),
          total_files: 0,
          total_size_mb: 0,
          total_receipts: 0,
          total_spending: 0,
          total_workspaces: 0,
          total_forms: 0,
        },
        receipts: {
          summary: {
            total_receipts: 0,
            total_amount: 0,
            average_amount: 0,
            period_days: parseInt(days),
          },
          categories: [],
          timeline: [],
          payment_methods: [],
          top_businesses: [],
        },
        files: {
          types: [],
          upload_trends: [],
        },
        workspaces: {
          total_workspaces: 0,
          workspace_details: [],
        },
        forms: {
          total_forms: 0,
          total_responses: 0,
          form_details: [],
        },
        recentActivity: [],
      };
      setAnalytics(basicData);
      setRecentReceipts([]);
      setRecentInvoices([]);
    } finally {
      console.log('🔚 Finally block - setting loading to false');
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
  };
  
  // Receipt categories (must match backend validation)
  const receiptCategories = [
    'Uncategorized',
    'Advertising',
    'Supplies',
    'Professional Services',
    'Personal',
    'Rent and Lease',
    'Education and Training',
    'Cars and Truck',
    'Travel',
    'Office Expenses',
    'Meals and Entertainment',
    'Contractors',
    'Employee Benefit',
    'Banking',
    'Other Expenses'
  ];
  
  const handleCategorizeReceipt = (receipt: any) => {
    setSelectedReceipt(receipt);
    setShowCategoryModal(true);
  };
  
  const handleSelectCategory = async (category: string) => {
    if (!selectedReceipt) return;
    
    setCategorizingReceipt(true);
    try {
      const response = await apiClient.categorizeReceipt(selectedReceipt.id, category);
      if (response.success) {
        Alert.alert('Success', `Receipt categorized as "${category}"`);
        // Update the receipt in the local state
        setRecentReceipts(prev => prev.map(r => 
          r.id === selectedReceipt.id ? { ...r, category } : r
        ));
        setShowCategoryModal(false);
        setSelectedReceipt(null);
      } else {
        Alert.alert('Error', response.message || 'Failed to categorize receipt');
      }
    } catch (error) {
      console.error('Error categorizing receipt:', error);
      Alert.alert('Error', 'Failed to categorize receipt');
    } finally {
      setCategorizingReceipt(false);
    }
  };
  
  // Invoice payment statuses (must match backend validation)
  const paymentStatuses = [
    'Paid',
    'Unpaid',
    'Partial'
  ];
  
  const handleUpdatePaymentStatus = (invoice: any) => {
    setSelectedInvoice(invoice);
    setShowPaymentStatusModal(true);
  };
  
  const handleSelectPaymentStatus = async (paymentStatus: string) => {
    if (!selectedInvoice) return;
    
    setUpdatingPaymentStatus(true);
    try {
      // The invoice object from recent_invoices has a file ID
      // The new endpoint /api/v1/web/files/{file_id}/payment-status accepts file ID
      const fileId = selectedInvoice.id;
      
      console.log('💳 Updating payment status:', {
        fileId,
        paymentStatus,
        invoiceObject: selectedInvoice,
      });
      
      if (!fileId) {
        Alert.alert('Error', 'File ID not found. Cannot update payment status.');
        setUpdatingPaymentStatus(false);
        return;
      }
      
      const response = await apiClient.updateInvoicePaymentStatus(fileId, paymentStatus);
      if (response.success) {
        Alert.alert('Success', `Invoice payment status updated to "${paymentStatus}"`);
        // Update the invoice in the local state
        setRecentInvoices(prev => prev.map(inv => {
          if (inv.id === fileId) {
            const updated = { ...inv };
            updated.payment_status = paymentStatus;
            if (updated.json_data) {
              updated.json_data.payment_status = paymentStatus.toLowerCase();
            } else {
              updated.json_data = { payment_status: paymentStatus.toLowerCase() };
            }
            return updated;
          }
          return inv;
        }));
        setShowPaymentStatusModal(false);
        setSelectedInvoice(null);
        // Reload analytics to get updated data
        loadAnalytics();
      } else {
        // Show error message
        const errorMsg = response.message || 'Failed to update payment status';
        Alert.alert('Error', errorMsg);
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      Alert.alert('Error', 'Failed to update payment status');
    } finally {
      setUpdatingPaymentStatus(false);
    }
  };

  const generateReportCSV = (reportType: 'receipts' | 'invoices'): string => {
    if (!analytics) {
      return '';
    }

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    };

    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let csvRows: string[] = [];

    if (reportType === 'receipts') {
      // Receipts Report
      csvRows.push('RECEIPTS ANALYTICS REPORT');
      csvRows.push(`Period: ${analytics.summary?.period || timePeriod} days`);
      csvRows.push(`Generated: ${new Date().toLocaleString()}`);
      csvRows.push('');

      // Summary Section
      csvRows.push('SUMMARY');
      csvRows.push('Metric,Value');
      csvRows.push(`Total Receipts,${analytics.receipts?.summary?.total_receipts || 0}`);
      csvRows.push(`Total Amount,${formatCurrency(analytics.receipts?.summary?.total_amount || 0)}`);
      csvRows.push(`Average Amount,${formatCurrency(analytics.receipts?.summary?.average_amount || 0)}`);
      csvRows.push('');

      // Categories Section
      if (analytics.receipts?.categories && analytics.receipts.categories.length > 0) {
        csvRows.push('CATEGORY BREAKDOWN');
        csvRows.push('Category,Count,Total Amount,Percentage');
        analytics.receipts.categories.forEach(cat => {
          csvRows.push(`${escapeCSV(cat.category)},${cat.count},${formatCurrency(cat.total_amount)},${cat.percentage.toFixed(2)}%`);
        });
        csvRows.push('');
      }

      // Top Businesses Section
      if (analytics.receipts?.top_businesses && analytics.receipts.top_businesses.length > 0) {
        csvRows.push('TOP BUSINESSES');
        csvRows.push('Business,Visit Count,Total Amount,Average Amount');
        analytics.receipts.top_businesses.forEach(business => {
          const avgAmount = business.count > 0 ? business.total_amount / business.count : 0;
          csvRows.push(`${escapeCSV(business.business)},${business.count},${formatCurrency(business.total_amount)},${formatCurrency(avgAmount)}`);
        });
        csvRows.push('');
      }

      // Payment Methods Section
      if (analytics.receipts?.payment_methods && analytics.receipts.payment_methods.length > 0) {
        csvRows.push('PAYMENT METHODS');
        csvRows.push('Payment Method,Count,Total Amount');
        analytics.receipts.payment_methods.forEach(method => {
          csvRows.push(`${escapeCSV(method.method)},${method.count},${formatCurrency(method.total_amount)}`);
        });
        csvRows.push('');
      }

      // Timeline Section
      if (analytics.receipts?.timeline && analytics.receipts.timeline.length > 0) {
        csvRows.push('TIMELINE');
        csvRows.push('Month,Count,Total Amount');
        analytics.receipts.timeline.forEach(item => {
          csvRows.push(`${escapeCSV(item.month)},${item.count},${formatCurrency(item.total_amount)}`);
        });
      }
    } else {
      // Invoices Report
      if (!analytics.invoices) {
        return '';
      }

      csvRows.push('INVOICES ANALYTICS REPORT');
      csvRows.push(`Period: ${analytics.summary?.period || timePeriod} days`);
      csvRows.push(`Generated: ${new Date().toLocaleString()}`);
      csvRows.push('');

      // Overview Section
      csvRows.push('OVERVIEW');
      csvRows.push('Metric,Value');
      csvRows.push(`Total Invoices,${analytics.invoices.overview?.total_invoices || 0}`);
      csvRows.push(`Total Amount,${formatCurrency(analytics.invoices.overview?.total_amount || 0)}`);
      csvRows.push(`Paid Amount,${formatCurrency(analytics.invoices.overview?.paid_amount || 0)}`);
      csvRows.push(`Unpaid Amount,${formatCurrency(analytics.invoices.overview?.unpaid_amount || 0)}`);
      csvRows.push(`Average Invoice Amount,${formatCurrency(analytics.invoices.overview?.avg_invoice_amount || 0)}`);
      csvRows.push(`Paid Count,${analytics.invoices.overview?.paid_count || 0}`);
      csvRows.push(`Unpaid Count,${analytics.invoices.overview?.unpaid_count || 0}`);
      csvRows.push(`Overdue Count,${analytics.invoices.overview?.overdue_count || 0}`);
      csvRows.push(`Overdue Amount,${formatCurrency(analytics.invoices.overview?.overdue_amount || 0)}`);
      csvRows.push('');

      // Payment Distribution Section
      if (analytics.invoices.payment_distribution && analytics.invoices.payment_distribution.length > 0) {
        csvRows.push('PAYMENT STATUS DISTRIBUTION');
        csvRows.push('Status,Count,Total Amount,Percentage');
        analytics.invoices.payment_distribution.forEach(item => {
          csvRows.push(`${escapeCSV(item.status)},${item.count},${formatCurrency(item.total_amount)},${item.percentage.toFixed(2)}%`);
        });
        csvRows.push('');
      }

      // Category Distribution Section
      if (analytics.invoices.category_distribution && analytics.invoices.category_distribution.length > 0) {
        csvRows.push('CATEGORY DISTRIBUTION');
        csvRows.push('Category,Count,Total Amount,Average Amount,Percentage');
        analytics.invoices.category_distribution.forEach(item => {
          csvRows.push(`${escapeCSV(item.category)},${item.count},${formatCurrency(item.total_amount)},${formatCurrency(item.avg_amount)},${item.percentage.toFixed(2)}%`);
        });
        csvRows.push('');
      }

      // Top Vendors Section
      if (analytics.invoices.top_vendors && analytics.invoices.top_vendors.length > 0) {
        csvRows.push('TOP VENDORS');
        csvRows.push('Vendor Name,Invoice Count,Total Amount,Average Amount');
        analytics.invoices.top_vendors.forEach(vendor => {
          csvRows.push(`${escapeCSV(vendor.vendor_name)},${vendor.count},${formatCurrency(vendor.total_amount)},${formatCurrency(vendor.avg_amount)}`);
        });
        csvRows.push('');
      }

      // Monthly Trends Section
      if (analytics.invoices.monthly_trends && analytics.invoices.monthly_trends.length > 0) {
        csvRows.push('MONTHLY TRENDS');
        csvRows.push('Month,Total Count,Total Amount,Paid Count,Unpaid Count');
        analytics.invoices.monthly_trends.forEach(trend => {
          csvRows.push(`${escapeCSV(trend.month)},${trend.count},${formatCurrency(trend.total_amount)},${trend.paid_count || 0},${trend.unpaid_count || 0}`);
        });
        csvRows.push('');
      }

      // Aging Buckets Section
      if (analytics.invoices.aging_buckets) {
        csvRows.push('AGING BUCKETS');
        csvRows.push('Age Range,Count,Amount');
        const buckets = analytics.invoices.aging_buckets;
        if (buckets['0-30']) csvRows.push(`0-30 days,${buckets['0-30'].count},${formatCurrency(buckets['0-30'].amount)}`);
        if (buckets['31-60']) csvRows.push(`31-60 days,${buckets['31-60'].count},${formatCurrency(buckets['31-60'].amount)}`);
        if (buckets['61-90']) csvRows.push(`61-90 days,${buckets['61-90'].count},${formatCurrency(buckets['61-90'].amount)}`);
        if (buckets['90+']) csvRows.push(`90+ days,${buckets['90+'].count},${formatCurrency(buckets['90+'].amount)}`);
      }
    }

    return csvRows.join('\n');
  };

  const handleShareReport = async () => {
    try {
      const reportType = activeTab === 'receipts' ? 'receipts' : 'invoices';
      console.log(`📊 Sharing ${reportType} report...`);

      // Use the correct web endpoint (POST request)
      const endpoint = `/api/v1/web/analysis/${reportType}/download-report`;
      console.log(`📊 Calling endpoint: ${endpoint}`);

      // Get cache directory
      const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!cacheDir) {
        throw new Error('Unable to access file system directories');
      }

      // Create filename with .docx extension (matching web version format: Receipt_Report_YYYY-MM-DD.docx)
      const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const fileName = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)}_Report_${dateStr}.docx`;
      const fileUri = `${cacheDir}${fileName}`;

      // Prepare request body with time period and optional category filter
      // Convert timePeriod string to integer (backend expects integer, not string)
      const daysInt = parseInt(timePeriod, 10) || 30; // Default to 30 if parsing fails
      const requestBody: any = {
        days: daysInt, // Pass the selected time period as integer (e.g., 7, 30, 90, 365)
      };
      
      // Add category filter if one is selected
      if (reportType === 'receipts' && selectedCategory && selectedCategory !== 'All') {
        requestBody.category = selectedCategory;
      } else if (reportType === 'invoices' && selectedInvoiceCategory && selectedInvoiceCategory !== 'All') {
        requestBody.category = selectedInvoiceCategory;
      }

      console.log(`📊 Request body:`, requestBody);
      console.log(`📊 Time period: ${timePeriod} days`);

      // Use apiClient to download the file with proper authentication (POST request)
      // Use 'arraybuffer' instead of 'blob' for React Native compatibility
      const response = await apiClient.client.post(endpoint, requestBody, {
        responseType: 'arraybuffer', // Use arraybuffer for React Native
      });

      // Convert arraybuffer to base64 for FileSystem
      const arrayBuffer = response.data;
      const bytes = new Uint8Array(arrayBuffer);

      // Convert to base64
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      // Use Buffer if available, otherwise manual base64 encoding
      let base64Data: string;
      if (typeof Buffer !== 'undefined') {
        base64Data = Buffer.from(binary, 'binary').toString('base64');
      } else {
        // Manual base64 encoding
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        let i = 0;
        while (i < binary.length) {
          const a = binary.charCodeAt(i++);
          const b = i < binary.length ? binary.charCodeAt(i++) : 0;
          const c = i < binary.length ? binary.charCodeAt(i++) : 0;
          const bitmap = (a << 16) | (b << 8) | c;
          result += chars.charAt((bitmap >> 18) & 63) + chars.charAt((bitmap >> 12) & 63) +
            (i - 2 < binary.length ? chars.charAt((bitmap >> 6) & 63) : '=') +
            (i - 1 < binary.length ? chars.charAt(bitmap & 63) : '=');
        }
        base64Data = result;
      }

      // Write file
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log(`📊 Report file saved to: ${fileUri}`);

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();

      if (isAvailable) {
        // Share the file (docx MIME type)
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          dialogTitle: `Share ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`,
        });
        console.log(`📊 ${reportType} report shared successfully`);
      } else {
        Alert.alert('Share Not Available', 'File sharing is not available on this device.');
      }

      // Clean up file after a delay
      setTimeout(async () => {
        try {
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(fileUri, { idempotent: true });
            console.log('📊 Cleaned up report file');
          }
        } catch (error) {
          console.warn('📊 Failed to clean up report file:', error);
        }
      }, 60000); // Delete after 1 minute

    } catch (error: any) {
      console.error(`📊 Error sharing ${activeTab} report:`, error);
      Alert.alert(
        'Share Failed',
        error.message || `Failed to share ${activeTab} report. Please try again.`
      );
    }
  };

  useEffect(() => {
    console.log('📊 AnalyticsDashboard useEffect triggered', { isAuthenticated, authLoading });
    // Wait for authentication to be ready before loading analytics
    if (!authLoading) {
      loadAnalytics();
    }
  }, [isAuthenticated, authLoading]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const TimePeriodSelector = () => (
    <View style={styles.timePeriodContainer}>
      <Text style={styles.sectionTitle}>Time Period</Text>
      <View style={styles.timePeriodButtons}>
        {['7', '30', '90', '365'].map((days) => (
          <TouchableOpacity
            key={days}
            style={[
              styles.timePeriodButton,
              timePeriod === days && styles.timePeriodButtonActive,
            ]}
            onPress={() => {
              setTimePeriod(days);
              loadAnalytics(days);
            }}
          >
            <Text
              style={[
                styles.timePeriodButtonText,
                timePeriod === days && styles.timePeriodButtonTextActive,
              ]}
            >
              {days === '7' ? '7 Days' : days === '30' ? '30 Days' : days === '90' ? '90 Days' : '1 Year'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const CategoryFilter = () => {
    const categories = [
      'All', 'Advertising', 'Supplies', 'Professional Services', 'Personal',
      'Rent and Lease', 'Education and Training', 'Cars and Truck', 'Travel',
      'Office Expenses', 'Meals and Entertainment', 'Contractors', 'Employee Benefit',
      'Banking', 'Other Expenses', 'Uncategorized'
    ];

    return (
      <View style={styles.categoryFilterContainer}>
        <Text style={styles.sectionTitle}>Receipt Category Filter</Text>
        <View style={styles.categoryFilterContent}>
          <Text style={styles.categoryFilterLabel}>Filter by Category:</Text>
          <View style={styles.categoryDropdown}>
            <Text style={styles.categoryDropdownText}>{selectedCategory}</Text>
            <Ionicons name="chevron-down" size={16} color="#666" />
          </View>
        </View>
        {selectedCategory !== 'All' && (
          <Text style={styles.categoryFilterNote}>
            Showing data for: <Text style={styles.categoryFilterNoteBold}>{selectedCategory}</Text>
          </Text>
        )}
      </View>
    );
  };

  const StatCard = ({ title, value, subtitle, icon, color }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: string;
    color: string;
  }) => (
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        <View style={[styles.statCardIcon, { backgroundColor: color }]}>
          <Ionicons name={icon as any} size={20} color="#fff" />
        </View>
        <Text style={styles.statCardTitle}>{title}</Text>
      </View>
      <Text style={styles.statCardValue}>{value}</Text>
      {subtitle && <Text style={styles.statCardSubtitle}>{subtitle}</Text>}
    </View>
  );

  const CategoryBar = ({ category, amount, percentage, color }: {
    category: string;
    amount: number;
    percentage: number;
    color: string;
  }) => (
    <View style={styles.categoryBar}>
      <View style={styles.categoryBarHeader}>
        <Text style={styles.categoryBarTitle}>{category}</Text>
        <Text style={styles.categoryBarAmount}>{formatCurrency(amount)}</Text>
      </View>
      <View style={styles.categoryBarContainer}>
        <View style={[styles.categoryBarFill, { width: `${percentage}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.categoryBarPercentage}>{percentage.toFixed(1)}%</Text>
    </View>
  );

  console.log('📊 AnalyticsDashboard render - loading:', loading, 'analytics:', !!analytics, 'authLoading:', authLoading);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analytics</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>
            {authLoading ? 'Checking authentication...' : 'Loading receipt analytics...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!analytics) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analytics</Text>
          <TouchableOpacity onPress={() => loadAnalytics()}>
            <Ionicons name="refresh" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="analytics-outline" size={64} color="#ccc" />
          <Text style={styles.errorText}>No receipt data available</Text>
          <Text style={styles.errorSubtext}>
            This might be because:{'\n'}
            • Your receipt is still being processed{'\n'}
            • No receipts found for the selected time period{'\n'}
            • Receipt data is not available
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadAnalytics()}>
            <Text style={styles.retryButtonText}>Refresh Data</Text>
          </TouchableOpacity>
          {__DEV__ && (
            <TouchableOpacity 
              style={[styles.retryButton, { backgroundColor: '#34C759', marginTop: 8 }]} 
              onPress={() => {
                console.log('🔄 Loading sample data for testing');
                const sampleData = {
                  summary: {
                    period: '7 days',
                    period_days: 7,
                    total_files: 1,
                    total_size_mb: 2.5,
                    total_receipts: 1,
                    total_spending: 25.50,
                    total_workspaces: 1,
                    total_forms: 0,
                  },
                  receipts: {
                    summary: {
                      total_receipts: 1,
                      total_amount: 25.50,
                      average_amount: 25.50,
                      period_days: 7,
                    },
                    categories: [
                      { category: 'Meals and Entertainment', count: 1, total_amount: 25.50, percentage: 100.0 },
                    ],
                    timeline: [],
                    payment_methods: [
                      { method: 'Credit Card', count: 1, total_amount: 25.50 },
                    ],
                    top_businesses: [
                      { business: 'Restaurant', count: 1, total_amount: 25.50 },
                    ],
                  },
                  files: {
                    types: [
                      { type: 'Image', count: 1, percentage: 100.0 },
                    ],
                    upload_trends: [],
                  },
                  workspaces: {
                    total_workspaces: 1,
                    workspace_details: [
                      { name: 'Personal Workspace', file_count: 1, member_count: 1 },
                    ],
                  },
                  forms: {
                    total_forms: 0,
                    total_responses: 0,
                    form_details: [],
                  },
                };
                setAnalytics(sampleData);
                setLoading(false);
              }}
            >
              <Text style={styles.retryButtonText}>Load Sample Data (Dev)</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const categoryColors = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF3B30', '#5856D6'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShareReport} style={styles.shareButton}>
            <Ionicons name="share-outline" size={24} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh}>
            <Ionicons name="refresh" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'receipts' && styles.tabActive]}
          onPress={() => setActiveTab('receipts')}
        >
          <Ionicons 
            name="receipt" 
            size={20} 
            color={activeTab === 'receipts' ? '#007AFF' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'receipts' && styles.tabTextActive]}>
            Receipts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'invoices' && styles.tabActive]}
          onPress={() => setActiveTab('invoices')}
        >
          <Ionicons 
            name="document-text" 
            size={20} 
            color={activeTab === 'invoices' ? '#007AFF' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'invoices' && styles.tabTextActive]}>
            Invoices
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <TimePeriodSelector />

        {activeTab === 'receipts' && (
          <>
            {analytics ? (
              <>
                {/* Receipt Overview Stats - Always show, even if zero */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Receipt Overview</Text>
                  <View style={styles.statsRow}>
                    <StatCard
                      title="Total Receipts"
                      value={analytics.summary?.total_receipts || analytics.receipts?.summary?.total_receipts || 0}
                      subtitle={formatCurrency(analytics.summary?.total_spending || analytics.receipts?.summary?.total_amount || 0)}
                      icon="receipt"
                      color="#34C759"
                    />
                    <StatCard
                      title="Average Receipt"
                      value={formatCurrency(
                        (analytics.receipts?.summary?.average_amount && analytics.receipts.summary.average_amount > 0)
                          ? analytics.receipts.summary.average_amount
                          : ((analytics.receipts?.summary?.total_receipts || 0) > 0 && (analytics.receipts?.summary?.total_amount || 0) > 0)
                            ? (analytics.receipts.summary.total_amount / analytics.receipts.summary.total_receipts)
                            : 0
                      )}
                      subtitle={`${analytics.receipts?.summary?.recent_30d || 0} in last 30 days`}
                      icon="calculator"
                      color="#007AFF"
                    />
                  </View>
                </View>
            
                {/* Category Distribution - Donut Chart + List */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Category Distribution</Text>
              {(analytics.receipts?.categories || []).length > 0 ? (
                <View style={styles.categoryChartContainer}>
                  {/* Donut Chart */}
                  <View style={styles.donutChartContainer}>
                    <View style={styles.donutChartWrapper}>
                      {(() => {
                        // Get all categories - don't filter by total_amount, use all categories
                        const allCategories = analytics.receipts?.categories || [];
                        
                        // Filter out only categories with zero or negative amounts
                        const categoriesWithData = allCategories.filter(c => 
                          (c.total_amount && c.total_amount > 0) || 
                          (c.count && c.count > 0) ||
                          (c.percentage && c.percentage > 0)
                        );
                        
                        console.log('📊 Pie chart categories:', {
                          allCategories: allCategories.length,
                          categoriesWithData: categoriesWithData.length,
                          categories: categoriesWithData.map(c => ({
                            category: c.category,
                            total_amount: c.total_amount,
                            percentage: c.percentage,
                            count: c.count
                          }))
                        });
                        
                        if (categoriesWithData.length === 0) {
                          return null;
                        }
                        
                        const size = 120;
                        const center = size / 2;
                        const radius = 45;
                        const innerRadius = 30;
                        const startAngle = -90; // Start from top
                        
                        // Calculate total amount for percentage calculation
                        const totalAmount = categoriesWithData.reduce((sum, c) => sum + (c.total_amount || 0), 0);
                        
                        // Calculate percentages for each category and normalize to sum to 100%
                        const categoryPercentages = categoriesWithData.map(category => {
                          // Use provided percentage or calculate from amount
                          let percentage = category.percentage || 0;
                          if (percentage === 0 && totalAmount > 0 && category.total_amount) {
                            percentage = (category.total_amount / totalAmount) * 100;
                          }
                          return percentage;
                        });
                        
                        // Calculate total percentage
                        const totalPercentage = categoryPercentages.reduce((sum, p) => sum + p, 0);
                        
                        // Normalize percentages to sum to exactly 100%
                        const normalizedPercentages = totalPercentage > 0 
                          ? categoryPercentages.map(p => (p / totalPercentage) * 100)
                          : categoryPercentages;
                        
                        // Verify normalization (should sum to 100)
                        const normalizedTotal = normalizedPercentages.reduce((sum, p) => sum + p, 0);
                        console.log('📊 Pie chart normalization:', {
                          originalTotal: totalPercentage,
                          normalizedTotal: normalizedTotal,
                          categoryCount: categoriesWithData.length
                        });
                        
                        const createArcPath = (startAngleDeg: number, endAngleDeg: number, outerRadius: number, innerRadius: number) => {
                          const start = (startAngleDeg * Math.PI) / 180;
                          const end = (endAngleDeg * Math.PI) / 180;
                          
                          const x1 = center + outerRadius * Math.cos(start);
                          const y1 = center + outerRadius * Math.sin(start);
                          const x2 = center + outerRadius * Math.cos(end);
                          const y2 = center + outerRadius * Math.sin(end);
                          
                          const x3 = center + innerRadius * Math.cos(end);
                          const y3 = center + innerRadius * Math.sin(end);
                          const x4 = center + innerRadius * Math.cos(start);
                          const y4 = center + innerRadius * Math.sin(start);
                          
                          const largeArc = end - start > Math.PI ? 1 : 0;
                          
                          return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
                        };
                        
                        // Build segments with normalized percentages
                        let currentAngle = startAngle;
                        const segments: Array<{category: any; startAngle: number; endAngle: number; color: string; index: number}> = [];
                        
                        categoriesWithData.forEach((category, index) => {
                          const percentage = normalizedPercentages[index];
                          const angle = (percentage / 100) * 360;
                          
                          // Only render segments with meaningful angles
                          if (angle >= 0.1) {
                            const segmentStartAngle = currentAngle;
                            const segmentEndAngle = currentAngle + angle;
                            
                            segments.push({
                              category,
                              startAngle: segmentStartAngle,
                              endAngle: segmentEndAngle,
                              color: categoryColors[index % categoryColors.length],
                              index
                            });
                            
                            currentAngle = segmentEndAngle;
                            
                            console.log(`📊 Category ${category.category}:`, {
                              percentage: percentage.toFixed(2),
                              angle: angle.toFixed(2),
                              startAngle: segmentStartAngle.toFixed(2),
                              endAngle: segmentEndAngle.toFixed(2)
                            });
                          }
                        });
                        
                        // Calculate remaining angle to complete the circle
                        const finalAngle = currentAngle;
                        const expectedEndAngle = startAngle + 360;
                        const remainingAngle = expectedEndAngle - finalAngle;
                        
                        console.log('📊 Pie chart completion:', {
                          startAngle,
                          finalAngle: finalAngle.toFixed(2),
                          expectedEndAngle,
                          remainingAngle: remainingAngle.toFixed(2),
                          segmentsCount: segments.length
                        });
                              
                              return (
                          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                            {segments.map((segment) => (
                                <Path
                                key={`segment-${segment.index}-${segment.category.category}`}
                                d={createArcPath(segment.startAngle, segment.endAngle, radius, innerRadius)}
                                fill={segment.color}
                                />
                            ))}
                            {/* Fill remaining space to complete the circle if needed */}
                            {Math.abs(remainingAngle) > 0.1 && (
                              <Path
                                key="remaining-segment"
                                d={createArcPath(finalAngle, expectedEndAngle, radius, innerRadius)}
                                fill={colors.background || '#F5F5F5'}
                                opacity={0.3}
                              />
                            )}
                          </Svg>
                        );
                      })()}
                    </View>
                    
                    {/* Legend */}
                    <View style={styles.donutLegend}>
                      {(analytics.receipts?.categories || []).filter(c => c.total_amount > 0).map((category, index) => {
                        const color = categoryColors[index % categoryColors.length];
                        return (
                          <View key={`legend-${index}-${category.category}`} style={styles.donutLegendItem}>
                            <View style={[styles.donutLegendDot, { backgroundColor: color }]} />
                            <Text style={styles.donutLegendText} numberOfLines={1}>
                              {category.category}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                  
                  {/* Category Breakdown List - Only categories with content */}
                  <View style={styles.categoryBreakdownList}>
                    <Text style={styles.categoryBreakdownTitle}>Category Breakdown</Text>
                    {(analytics.receipts?.categories || []).filter(c => c.total_amount > 0).map((category, index) => {
                      const color = categoryColors[index % categoryColors.length];
                      return (
                        <View key={`breakdown-${index}-${category.category}`} style={styles.categoryBreakdownItem}>
                          <View style={styles.categoryBreakdownLeft}>
                            <View style={[styles.categoryBreakdownDot, { backgroundColor: color }]} />
                            <Text style={styles.categoryBreakdownName}>{category.category}</Text>
                          </View>
                          <View style={styles.categoryBreakdownRight}>
                            <Text style={styles.categoryBreakdownAmount}>{formatCurrency(category.total_amount)}</Text>
                            <Text style={styles.categoryBreakdownPercent}>{category.percentage.toFixed(1)}%</Text>
                            <Text style={styles.categoryBreakdownCount}>{category.count}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <Text style={styles.emptyText}>No receipt categories yet</Text>
              )}
            </View>

                {/* Monthly Spending Trends */}
                {(analytics.receipts?.timeline || []).length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Monthly Spending Trends</Text>
                    <View style={styles.trendsContainer}>
                      <View style={styles.trendsBars}>
                        {(analytics.receipts.timeline || []).map((month, index) => {
                          const maxAmount = Math.max(...(analytics.receipts.timeline || []).map(m => m.total_amount));
                          const height = maxAmount > 0 ? (month.total_amount / maxAmount) * 100 : 0;
                          return (
                            <View key={`trend-${index}-${month.month}`} style={styles.trendBar}>
                              <View 
                                style={[
                                  styles.trendBarFill, 
                                  { height: `${Math.max(height, 2)}%` }
                                ]} 
                              />
                              <Text style={styles.trendBarLabel} numberOfLines={1}>
                                {month.month.length > 6 ? month.month.substring(0, 3) : month.month}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                      <View style={styles.trendsValues}>
                        {(analytics.receipts.timeline || []).map((month, index) => (
                          <View key={`value-${index}-${month.month}`} style={styles.trendValue}>
                            <Text style={styles.trendValueAmount}>{formatCurrency(month.total_amount)}</Text>
                            <Text style={styles.trendValueCount}>{month.count}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}

                {/* Receipt Size Distribution */}
                {recentReceipts.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Receipt Size Distribution</Text>
                    {(() => {
                      // Calculate receipt size distribution
                      const sizeRanges = {
                        '0-25': { count: 0, total: 0 },
                        '25-50': { count: 0, total: 0 },
                        '50+': { count: 0, total: 0 },
                      };

                      recentReceipts.forEach((receipt: any) => {
                        const amount = receipt.json_data?.total_amount || 
                                      receipt.json_data?.amount || 
                                      receipt.json_data?.total ||
                                      receipt.amount || 
                                      receipt.total_amount || 0;
                        const numericAmount = typeof amount === 'number' ? amount : 
                                             (typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) || 0 : 0);
                        
                        if (numericAmount <= 25) {
                          sizeRanges['0-25'].count++;
                          sizeRanges['0-25'].total += numericAmount;
                        } else if (numericAmount <= 50) {
                          sizeRanges['25-50'].count++;
                          sizeRanges['25-50'].total += numericAmount;
                        } else {
                          sizeRanges['50+'].count++;
                          sizeRanges['50+'].total += numericAmount;
                        }
                      });

                      const maxCount = Math.max(sizeRanges['0-25'].count, sizeRanges['25-50'].count, sizeRanges['50+'].count);

                      return (
                        <View style={styles.sizeDistributionContainer}>
                          {Object.entries(sizeRanges).map(([range, data], index) => {
                            const percentage = maxCount > 0 ? (data.count / maxCount) * 100 : 0;
                            const color = index === 0 ? '#FF9500' : index === 1 ? '#8E8E93' : '#FF9500';
                            return (
                              <View key={`size-${range}`} style={styles.sizeDistributionItem}>
                                <View style={styles.sizeDistributionHeader}>
                                  <Text style={styles.sizeDistributionLabel}>${range}</Text>
                                  <Text style={styles.sizeDistributionAmount}>{formatCurrency(data.total)}</Text>
                                </View>
                                <View style={styles.sizeDistributionBar}>
                                  <View style={[styles.sizeDistributionBarFill, { width: `${percentage}%`, backgroundColor: color }]} />
                                </View>
                                <Text style={styles.sizeDistributionCount}>{data.count} receipt{data.count !== 1 ? 's' : ''}</Text>
                              </View>
                            );
                          })}
                        </View>
                      );
                    })()}
                  </View>
                )}

                  {/* Recent Receipts */}
                  {recentReceipts.length > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Recent Receipts ({recentReceipts.length})</Text>
                      {recentReceipts.slice(0, 50).map((receipt, index) => {
                        const amount = receipt.json_data?.total_amount || 
                                      receipt.json_data?.amount || 
                                      receipt.json_data?.total ||
                                      receipt.amount || 
                                      receipt.total_amount || 0;
                        const numericAmount = typeof amount === 'number' ? amount : 
                                             (typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) || 0 : 0);
                        
                        // Extract business name from multiple possible locations
                        const businessName = receipt.json_data?.store_name || 
                                           receipt.json_data?.business_name || 
                                           receipt.json_data?.merchant_name ||
                                           receipt.json_data?.receipt_data?.store_name ||
                                           receipt.json_data?.receipt_data?.business_name ||
                                           receipt.json_data?.receipt_data?.merchant_name ||
                                           receipt.original_filename || 
                                           receipt.filename || 
                                           receipt.name || 
                                           `Receipt ${index + 1}`;
                        
                        // Extract category
                        const category = receipt.category || receipt.json_data?.category || 'Uncategorized';
                        
                        // Debug logging for "techwave" receipts
                        if (businessName.toLowerCase().includes('techwave')) {
                          console.log('🔍 Techwave receipt found:', {
                            businessName,
                            extractedAmount: amount,
                            numericAmount,
                            jsonDataKeys: receipt.json_data ? Object.keys(receipt.json_data) : [],
                            jsonDataTotal: receipt.json_data?.total,
                            jsonDataAmount: receipt.json_data?.amount,
                            jsonDataTotalAmount: receipt.json_data?.total_amount,
                            receiptAmount: receipt.amount,
                            fullJsonData: JSON.stringify(receipt.json_data).substring(0, 500)
                          });
                        }
                        
                        // Format date
                        const date = receipt.created_at ? new Date(receipt.created_at).toLocaleDateString() : 
                                    receipt.json_data?.date ? new Date(receipt.json_data.date).toLocaleDateString() :
                                    receipt.json_data?.receipt_data?.date ? new Date(receipt.json_data.receipt_data.date).toLocaleDateString() :
                                    'Unknown date';
                        
                        return (
                          <View key={`receipt-${index}-${receipt.id || index}`} style={styles.receiptItemContainer}>
                            <View style={styles.compactListItem}>
                            <View style={styles.compactListInfo}>
                              <Text style={styles.compactListName}>{businessName}</Text>
                              <Text style={styles.compactListSubtext}>
                                  {date} • {category}
                              </Text>
                            </View>
                              <View style={styles.receiptActions}>
                            <Text style={styles.compactListAmount}>{formatCurrency(numericAmount)}</Text>
                                <TouchableOpacity 
                                  style={styles.categorizeButton}
                                  onPress={() => handleCategorizeReceipt(receipt)}
                                >
                                  <Ionicons name="pricetag-outline" size={18} color="#007AFF" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Recent Receipts</Text>
                      <View style={styles.emptyContainer}>
                        <Ionicons name="receipt-outline" size={48} color="#ccc" />
                        <Text style={styles.emptyText}>No Receipts Found</Text>
                        <Text style={styles.emptySubtext}>
                          {analytics?.receipts?.summary?.total_receipts 
                            ? `Analytics shows ${analytics.receipts.summary.total_receipts} receipt(s), but no receipt files were found.`
                            : 'Upload some receipts to see them here.'}
                        </Text>
                        {__DEV__ && (
                          <Text style={[styles.emptySubtext, { marginTop: 8, fontSize: 10 }]}>
                            Debug: recentReceipts.length = {recentReceipts.length}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
              </>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="receipt-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No Receipt Data Available</Text>
                <Text style={styles.emptySubtext}>
                  Receipt analytics will appear here once you upload some receipts.
                </Text>
              </View>
            )}
          </>
        )}

        {activeTab === 'invoices' && (
          <>
            {analytics.invoices && analytics.invoices.overview ? (
              <>
                {/* Invoice Overview Stats */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Invoice Overview</Text>
                  <View style={styles.statsRow}>
                    <StatCard
                      title="Total Invoices"
                      value={analytics.invoices.overview.total_invoices || 0}
                      subtitle={formatCurrency(analytics.invoices.overview.total_amount || 0)}
                      icon="document-text"
                      color="#2563EB"
                    />
                    <StatCard
                      title="Overdue"
                      value={analytics.invoices.overview.overdue_count || 0}
                      subtitle={formatCurrency(analytics.invoices.overview.overdue_amount || 0)}
                      icon="calendar"
                      color="#F59E0B"
                    />
                  </View>
                  <View style={styles.statsRow}>
                    <StatCard
                      title="Paid"
                      value={analytics.invoices.overview.paid_count || 0}
                      subtitle={formatCurrency(analytics.invoices.overview.paid_amount || 0)}
                      icon="checkmark-circle"
                      color="#10B981"
                    />
                    <StatCard
                      title="Unpaid"
                      value={analytics.invoices.overview.unpaid_count || 0}
                      subtitle={formatCurrency(analytics.invoices.overview.unpaid_amount || 0)}
                      icon="close-circle"
                      color="#EF4444"
                    />
                  </View>
                </View>

                {/* Payment Status Distribution */}
                {analytics.invoices.payment_distribution && analytics.invoices.payment_distribution.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Payment Status</Text>
                    <View style={styles.compactChartContainer}>
                      {analytics.invoices.payment_distribution.map((item, index) => {
                        const colors: Record<string, string> = { 'Paid': '#10B981', 'Unpaid': '#EF4444', 'Partial': '#F59E0B' };
                        const color = colors[item.status] || '#6366F1';
                        return (
                          <View key={`payment-${index}-${item.status}`} style={styles.compactChartItem}>
                            <View style={styles.compactChartHeader}>
                              <View style={[styles.compactChartDot, { backgroundColor: color }]} />
                              <Text style={styles.compactChartLabel}>{item.status}</Text>
                            </View>
                            <View style={styles.compactChartBar}>
                              <View style={[styles.compactChartFill, { width: `${item.percentage}%`, backgroundColor: color }]} />
                            </View>
                            <View style={styles.compactChartValues}>
                              <Text style={styles.compactChartAmount}>{formatCurrency(item.total_amount)}</Text>
                              <Text style={styles.compactChartPercentage}>{item.percentage.toFixed(1)}%</Text>
                              <Text style={styles.compactChartCount}>{item.count}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Recent Invoices */}
                {recentInvoices.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recent Invoices</Text>
                    {recentInvoices.map((invoice, index) => {
                      const amount = invoice.json_data?.total_amount || 
                                    invoice.json_data?.amount || 
                                    invoice.json_data?.invoice_amount ||
                                    invoice.json_data?.total ||
                                    invoice.amount || 
                                    invoice.total_amount || 0;
                      const numericAmount = typeof amount === 'number' ? amount : 
                                           (typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) || 0 : 0);
                      
                      // Extract business/vendor name from multiple possible locations
                      // Prioritize vendor_name, business_name, vendor fields over filename
                      const businessName = invoice.vendor_name ||
                                          invoice.business_name ||
                                          invoice.vendor ||
                                          invoice.json_data?.vendor_name || 
                                          invoice.json_data?.business_name || 
                                          invoice.json_data?.vendor ||
                                          invoice.json_data?.merchant_name ||
                                          invoice.json_data?.invoice_data?.vendor_name ||
                                          invoice.json_data?.invoice_data?.business_name ||
                                          invoice.json_data?.invoice_data?.vendor ||
                                          invoice.json_data?.invoice_data?.merchant_name ||
                                          `Invoice ${index + 1}`;
                      
                      // Only use filename as last resort if no business name is found
                      // Remove filename from the fallback chain
                      
                      const date = invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : 
                                  invoice.json_data?.date ? new Date(invoice.json_data.date).toLocaleDateString() :
                                  invoice.json_data?.invoice_date ? new Date(invoice.json_data.invoice_date).toLocaleDateString() :
                                  'Unknown date';
                      const status = (invoice.payment_status || 
                                    invoice.json_data?.payment_status || 
                                    invoice.json_data?.status || 
                                    'unpaid').toLowerCase();
                      const statusColor = status === 'paid' ? '#10B981' : status === 'partial' ? '#F59E0B' : '#EF4444';
                      
                      return (
                        <View key={`invoice-${index}-${invoice.id || index}`} style={styles.receiptItemContainer}>
                          <View style={styles.compactListItem}>
                          <View style={styles.compactListInfo}>
                              <Text style={styles.compactListName}>{businessName}</Text>
                            <Text style={styles.compactListSubtext}>
                              {date} • <Text style={{ color: statusColor, textTransform: 'capitalize' }}>{status}</Text>
                            </Text>
                          </View>
                            <View style={styles.receiptActions}>
                          <Text style={styles.compactListAmount}>{formatCurrency(numericAmount)}</Text>
                              <TouchableOpacity 
                                style={styles.categorizeButton}
                                onPress={() => handleUpdatePaymentStatus(invoice)}
                              >
                                <Ionicons name="card-outline" size={18} color="#007AFF" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No Invoice Data Available</Text>
                <Text style={styles.emptySubtext}>
                  Invoice analytics will appear here once you upload some invoices.
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      
      {/* Category Selection Modal */}
      <Modal
        visible={showCategoryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.categoryList}>
              {receiptCategories.map((category) => (
                <TouchableOpacity
                  key={category}
                  style={styles.categoryModalItem}
                  onPress={() => handleSelectCategory(category)}
                  disabled={categorizingReceipt}
                >
                  <Text style={styles.categoryItemText}>{category}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            {categorizingReceipt && (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#007AFF" />
              </View>
            )}
          </View>
        </View>
      </Modal>
      
      {/* Payment Status Selection Modal */}
      <Modal
        visible={showPaymentStatusModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPaymentStatusModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Payment Status</Text>
              <TouchableOpacity 
                onPress={() => setShowPaymentStatusModal(false)}
                disabled={updatingPaymentStatus}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.categoryList}>
              {paymentStatuses.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={styles.categoryModalItem}
                  onPress={() => handleSelectPaymentStatus(status)}
                  disabled={updatingPaymentStatus}
                >
                  <Text style={styles.categoryItemText}>{status}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            {updatingPaymentStatus && (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#007AFF" />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shareButton: {
    padding: 4,
  },
  placeholder: {
    width: 24,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  subsection: {
    marginBottom: 24,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  timePeriodContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  timePeriodButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  timePeriodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  timePeriodButtonActive: {
    backgroundColor: '#007AFF',
  },
  timePeriodButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  timePeriodButtonTextActive: {
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statsRowThree: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  statCardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  statCardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  statCardSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  categoryBar: {
    marginBottom: 16,
  },
  categoryBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBarTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  categoryBarAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  categoryBarContainer: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    marginBottom: 4,
  },
  categoryBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryBarPercentage: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },
  businessItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  businessInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  businessStats: {
    fontSize: 12,
    color: '#666',
  },
  businessRank: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  fileTypeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  fileTypeInfo: {
    flex: 1,
  },
  fileTypeName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  fileTypeCount: {
    fontSize: 12,
    color: '#666',
  },
  fileTypePercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  storageInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  workspaceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  workspaceInfo: {
    flex: 1,
  },
  workspaceName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  workspaceStats: {
    fontSize: 12,
    color: '#666',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  
  // Category Filter Styles
  categoryFilterContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  categoryFilterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryFilterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  categoryDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categoryDropdownText: {
    fontSize: 14,
    color: '#333',
    marginRight: 8,
  },
  categoryFilterNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  categoryFilterNoteBold: {
    fontWeight: '600',
    color: '#007AFF',
  },
  
  // Receipt Stats Grid
  receiptStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  
  // Category Item Styles
  categoryItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  categoryItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryItemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  categoryItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  categoryItemAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  categoryItemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryItemPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  categoryItemCount: {
    fontSize: 12,
    color: '#666',
  },
  categoryProgressBar: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  categoryProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  
  // Enhanced Business Item Styles
  businessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  businessAmount: {
    alignItems: 'flex-end',
  },
  businessTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#AF52DE',
    marginBottom: 2,
  },
  
  // Activity Item Styles
  activityItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  activityText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabActive: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  compactChartContainer: {
    gap: 12,
  },
  compactChartItem: {
    marginBottom: 12,
  },
  // Category Chart Container
  categoryChartContainer: {
    marginTop: 8,
  },
  // Donut Chart Styles
  donutChartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
  },
  donutChartWrapper: {
    width: 120,
    height: 120,
    marginRight: 16,
  },
  donutLegend: {
    flex: 1,
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: 8,
  },
  donutLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 6,
    minWidth: 100,
  },
  donutLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  donutLegendText: {
    fontSize: 12,
    color: '#333',
    flex: 1,
  },
  // Category Breakdown List
  categoryBreakdownList: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  categoryBreakdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  categoryBreakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryBreakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryBreakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  categoryBreakdownName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  categoryBreakdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  categoryBreakdownAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    minWidth: 80,
    textAlign: 'right',
  },
  categoryBreakdownPercent: {
    fontSize: 13,
    color: '#666',
    minWidth: 50,
    textAlign: 'right',
  },
  categoryBreakdownCount: {
    fontSize: 13,
    color: '#999',
    minWidth: 35,
    textAlign: 'right',
  },
  compactChartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  compactChartDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  compactChartLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  compactChartBar: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    marginBottom: 6,
    overflow: 'hidden',
  },
  compactChartFill: {
    height: '100%',
    borderRadius: 3,
  },
  compactChartValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactChartAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  compactChartPercentage: {
    fontSize: 13,
    fontWeight: '500',
    color: '#007AFF',
  },
  compactChartCount: {
    fontSize: 12,
    color: '#666',
  },
  compactListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  compactListInfo: {
    flex: 1,
  },
  compactListName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  compactListSubtext: {
    fontSize: 12,
    color: '#666',
  },
  compactListAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 40,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Monthly Trends Styles
  trendsContainer: {
    marginTop: 8,
  },
  trendsBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 4,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  trendBar: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  trendBarFill: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
    minHeight: 2,
    width: '100%',
  },
  trendBarLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  trendsValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  trendValue: {
    flex: 1,
    alignItems: 'center',
  },
  trendValueAmount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
  },
  trendValueCount: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  // Receipt Size Distribution Styles
  sizeDistributionContainer: {
    marginTop: 8,
    gap: 12,
  },
  sizeDistributionItem: {
    marginBottom: 12,
  },
  sizeDistributionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sizeDistributionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  sizeDistributionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  sizeDistributionBar: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    marginBottom: 4,
    overflow: 'hidden',
  },
  sizeDistributionBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  sizeDistributionCount: {
    fontSize: 12,
    color: '#666',
  },
  
  // Receipt item with actions
  receiptItemContainer: {
    marginBottom: 8,
  },
  receiptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categorizeButton: {
    padding: 6,
  },
  
  // Category Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  categoryList: {
    maxHeight: 400,
  },
  categoryModalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryItemText: {
    fontSize: 16,
    color: '#333',
  },
  modalLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 